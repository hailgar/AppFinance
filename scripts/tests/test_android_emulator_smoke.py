import importlib.util
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

spec = importlib.util.spec_from_file_location(
    "android_emulator_smoke", Path(__file__).parents[1] / "android_emulator_smoke.py")
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)

LOGIN_XML = '<hierarchy><node text="Catat Harian"/><node content-desc="Masuk dengan Google"/></hierarchy>'


class Emulator:
    def __init__(self, *, api="35", qemu="1", gms=True, crash=False, visible=True, launcher=None):
        self.api, self.qemu, self.gms = api, qemu, gms
        self.crash, self.visible, self.launcher = crash, visible, launcher
        self.pid_checks, self.calls, self.now = 0, [], 0

    def pause(self, seconds):
        self.now += seconds

    def __call__(self, *args, allow_failure=False):
        self.calls.append(args)
        if args == ("get-state",):
            return "device"
        if args[:2] == ("shell", "getprop"):
            return {"sys.boot_completed": "1", "ro.kernel.qemu": self.qemu,
                    "ro.build.version.sdk": self.api, "ro.product.cpu.abi": "x86_64"}[args[-1]]
        if args[:3] == ("shell", "pm", "path"):
            if args[-1] == "com.google.android.gms" and not self.gms:
                return ""
            return "package:/system/example.apk"
        if args[0] == "install":
            return "Performing Streamed Install\nSuccess"
        if args[:3] == ("shell", "pm", "clear"):
            return "Success"
        if args[:4] == ("shell", "cmd", "package", "resolve-activity"):
            return self.launcher or "id.catatharian.app/.MainActivity"
        if args[:3] == ("shell", "am", "start"):
            return "Status: ok\nActivity: id.catatharian.app/.MainActivity"
        if args[:2] == ("shell", "pidof"):
            self.pid_checks += 1
            return "" if self.crash and self.pid_checks > 2 else "1234"
        if args[:2] == ("exec-out", "cat"):
            return LOGIN_XML if self.visible else '<hierarchy><node text="Error loading app"/></hierarchy>'
        if args[:2] == ("shell", "uiautomator") or args[:2] == ("shell", "rm"):
            return ""
        raise AssertionError("Unexpected ADB operation")


class EmulatorSmokeTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.apk = Path(self.temp.name) / "app.apk"
        with ZipFile(self.apk, "w") as archive:
            archive.writestr("assets/index.android.bundle", "test-only packaged bundle")

    def run_app(self, emulator):
        smoke.check_environment(emulator, 35)
        return smoke.smoke_apk(emulator, self.apk, "id.catatharian.app",
                               clock=lambda: emulator.now, pause=emulator.pause)

    def test_boot_only_report_does_not_claim_app_acceptance(self):
        result = smoke.check_environment(Emulator(), 35)
        self.assertTrue(result["emulator_booted"])
        self.assertFalse(result["app_tested"])

    def test_wrong_api_missing_google_services_and_physical_targets_are_rejected(self):
        for emulator in [Emulator(api="34"), Emulator(qemu="0"), Emulator(gms=False)]:
            with self.subTest(emulator=emulator), self.assertRaises(smoke.SmokeFailure):
                smoke.check_environment(emulator, 35)
        with self.assertRaises(smoke.SmokeFailure):
            smoke.Adb("physical-device-serial")

    def test_standalone_app_must_render_signed_out_react_screen_and_stay_alive(self):
        emulator = Emulator()
        result = self.run_app(emulator)
        self.assertTrue(result["login_screen_rendered"])
        self.assertGreaterEqual(emulator.now, 20)
        self.assertFalse(result["google_login_tested"])
        self.assertFalse(result["financial_flow_tested"])
        self.assertFalse(any(call[:1] == ("logcat",) for call in emulator.calls))

    def test_activity_start_alone_cannot_pass_when_js_screen_is_missing(self):
        with self.assertRaisesRegex(smoke.SmokeFailure, "did not render"):
            self.run_app(Emulator(visible=False))

    def test_post_render_process_exit_cannot_pass(self):
        with self.assertRaisesRegex(smoke.SmokeFailure, "exited after"):
            self.run_app(Emulator(crash=True))

    def test_other_package_launcher_is_rejected(self):
        with self.assertRaisesRegex(smoke.SmokeFailure, "launcher"):
            self.run_app(Emulator(launcher="com.example.other/.MainActivity"))

    def test_development_apk_without_standalone_bundle_is_rejected(self):
        with ZipFile(self.apk, "w") as archive:
            archive.writestr("AndroidManifest.xml", "test-only manifest")
        with self.assertRaisesRegex(smoke.SmokeFailure, "standalone"):
            self.run_app(Emulator())

    def test_ui_error_or_malformed_xml_is_not_the_login_screen(self):
        self.assertFalse(smoke.login_visible("not xml"))
        self.assertFalse(smoke.login_visible('<hierarchy><node text="Catat Harian"/></hierarchy>'))
        self.assertTrue(smoke.login_visible(LOGIN_XML))


if __name__ == "__main__":
    unittest.main()
