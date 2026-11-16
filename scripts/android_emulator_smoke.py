"""Secret-free emulator preflight and fresh-install, signed-out APK launch smoke.

No account login, personal data, screenshots, UI XML or logcat are persisted.
Environment-only success is deliberately distinct from application acceptance.
"""
import argparse
import json
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path
from zipfile import BadZipFile, ZipFile


class SmokeFailure(Exception):
    pass


class Adb:
    def __init__(self, serial):
        if not re.fullmatch(r"emulator-[0-9]+", serial):
            raise SmokeFailure("This smoke check requires an emulator serial, never a physical device.")
        self.serial = serial

    def __call__(self, *args, allow_failure=False):
        try:
            result = subprocess.run(["adb", "-s", self.serial, *args], capture_output=True,
                                    text=True, timeout=30, check=False)
        except (OSError, subprocess.TimeoutExpired):
            raise SmokeFailure("ADB was unavailable or timed out.") from None
        if result.returncode and not allow_failure:
            raise SmokeFailure("An ADB operation failed; no raw device output was recorded.")
        return result.stdout.strip()


def check_environment(adb, expected_api):
    if adb("get-state") != "device" or adb("shell", "getprop", "sys.boot_completed") != "1":
        raise SmokeFailure("Emulator has not completed booting.")
    if adb("shell", "getprop", "ro.kernel.qemu") != "1":
        raise SmokeFailure("Connected Android target is not an emulator.")
    api = adb("shell", "getprop", "ro.build.version.sdk")
    abi = adb("shell", "getprop", "ro.product.cpu.abi")
    if api != str(expected_api) or abi != "x86_64":
        raise SmokeFailure("Emulator API or architecture does not match the declared test target.")
    if not adb("shell", "pm", "path", "com.google.android.gms").startswith("package:"):
        raise SmokeFailure("Google Play services are missing from the emulator image.")
    return {"api_level": expected_api, "abi": abi, "google_play_services": True,
            "emulator_booted": True, "app_tested": False}


def validate_apk(apk):
    try:
        with ZipFile(apk) as archive:
            if "assets/index.android.bundle" not in archive.namelist():
                raise SmokeFailure("APK lacks a bundled application; use the standalone preview profile.")
    except (OSError, BadZipFile):
        raise SmokeFailure("A real readable APK is required.") from None


def login_visible(xml):
    try:
        root = ET.fromstring(xml)
    except ET.ParseError:
        return False
    labels = {node.attrib.get(key, "") for node in root.iter()
              for key in ("text", "content-desc")}
    return {"Catat Harian", "Masuk dengan Google"}.issubset(labels)


def smoke_apk(adb, apk, package, clock=time.monotonic, pause=time.sleep):
    if not re.fullmatch(r"[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+", package):
        raise SmokeFailure("Invalid Android application ID.")
    validate_apk(apk)
    installed = adb("install", "-r", "-t", str(apk.resolve()))
    if "Success" not in installed.splitlines():
        raise SmokeFailure("APK installation did not report success.")
    if not adb("shell", "pm", "path", package).startswith("package:"):
        raise SmokeFailure("Installed APK does not expose the expected application ID.")
    # CI uses a fresh emulator; never reuse an authenticated financial session.
    if adb("shell", "pm", "clear", package) != "Success":
        raise SmokeFailure("Could not prepare a fresh signed-out application session.")
    resolved = adb("shell", "cmd", "package", "resolve-activity", "--brief",
                   "-a", "android.intent.action.MAIN", "-c", "android.intent.category.LAUNCHER", package)
    component = resolved.splitlines()[-1] if resolved else ""
    if not re.fullmatch(re.escape(package) + r"/[A-Za-z0-9_.$]+", component):
        raise SmokeFailure("Could not resolve the expected app launcher activity.")
    launch = adb("shell", "am", "start", "-W", "-n", component)
    if "Status: ok" not in launch or "Error" in launch:
        raise SmokeFailure("Application activity did not launch successfully.")
    deadline = clock() + 60
    visible = False
    while clock() < deadline:
        if not adb("shell", "pidof", package, allow_failure=True):
            raise SmokeFailure("Application process exited during startup.")
        adb("shell", "uiautomator", "dump", "/sdcard/catat-smoke.xml", allow_failure=True)
        visible = login_visible(adb("exec-out", "cat", "/sdcard/catat-smoke.xml", allow_failure=True))
        if visible:
            break
        pause(2)
    if not visible:
        raise SmokeFailure("Signed-out React Native login screen did not render within 60 seconds.")
    # Detect immediate post-render exits instead of passing on am-start alone.
    for _ in range(20):
        pause(1)
        if not adb("shell", "pidof", package, allow_failure=True):
            raise SmokeFailure("Application exited after the login screen rendered.")
    adb("shell", "rm", "-f", "/sdcard/catat-smoke.xml")
    return {"app_tested": True, "apk_installed": True, "login_screen_rendered": True,
            "process_stable_seconds": 20, "google_login_tested": False,
            "financial_flow_tested": False, "physical_device_tested": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-api", type=int, default=35)
    parser.add_argument("--apk", type=Path)
    parser.add_argument("--package", default="id.catatharian.app")
    args = parser.parse_args()
    try:
        adb = Adb(os.environ.get("ANDROID_SERIAL", "emulator-5554"))
        report = check_environment(adb, args.expected_api)
        if args.apk:
            report.update(smoke_apk(adb, args.apk, args.package))
        report["passed"] = True
    except SmokeFailure as error:
        print(json.dumps({"passed": False, "error": str(error)}))
        return 1
    print(json.dumps(report, sort_keys=True))
    summary = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary:
        with open(summary, "a") as output:
            output.write("\n### Android emulator smoke\n\n```json\n" + json.dumps(report, indent=2) + "\n```\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
