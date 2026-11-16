"""Validate actual Android/Firebase build configuration without logging its contents."""
import argparse
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen


def validate_configuration(env, mobile):
    base = env.get("EXPO_PUBLIC_API_BASE_URL", "")
    try:
        url = urlsplit(base)
        port = url.port  # Access validates malformed/out-of-range explicit ports.
        valid_url = (url.scheme == "https" and url.hostname and
                     url.username is None and url.password is None and
                     not any(character.isspace() for character in base) and
                     (port is None or port > 0) and not url.query and not url.fragment and
                     url.path.rstrip("/") == "/api/v1")
    except ValueError:
        valid_url = False
    if not valid_url:
        raise ValueError("EXPO_PUBLIC_API_BASE_URL must be an HTTPS URL ending in /api/v1.")
    web_id = env.get("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID", "")
    if not web_id.endswith(".apps.googleusercontent.com"):
        raise ValueError("EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is missing or invalid.")
    path = Path(env.get("GOOGLE_SERVICES_FILE", "google-services.json"))
    if not path.is_absolute():
        path = mobile / path
    if not path.is_file():
        raise ValueError("Firebase Android configuration is missing: GOOGLE_SERVICES_FILE.")
    try:
        data = json.loads(path.read_text())
        if not isinstance(data, dict) or any(k in data for k in ("private_key", "client_email", "refresh_token")):
            raise ValueError("Use Firebase Android config, never backend credentials, for the mobile build.")
        if not data.get("project_info", {}).get("project_id"):
            raise ValueError("Firebase Android configuration has no project_info.project_id.")
        package = env.get("ANDROID_APPLICATION_ID", "id.catatharian.app")
        clients = [c for c in data.get("client", []) if
                   c.get("client_info", {}).get("android_client_info", {}).get("package_name") == package]
        if not clients:
            raise ValueError("ANDROID_APPLICATION_ID does not match the Firebase Android app.")
        oauth = [c for client in clients for c in client.get("oauth_client", [])]
        if not any(c.get("client_type") == 3 and c.get("client_id") == web_id for c in oauth):
            raise ValueError("Web OAuth client ID does not match the Firebase Android configuration.")
        signing_sha1 = env.get("ANDROID_SIGNING_SHA1", "").replace(":", "").upper()
        if signing_sha1 and not re.fullmatch(r"[0-9A-F]{40}", signing_sha1):
            raise ValueError("ANDROID_SIGNING_SHA1 must be a 40-digit SHA-1 certificate fingerprint.")
        if signing_sha1 and not any(c.get("client_type") == 1 and
            c.get("android_info", {}).get("package_name") == package and
            c.get("android_info", {}).get("certificate_hash", "").replace(":", "").upper() == signing_sha1
            for c in oauth):
            raise ValueError("Signing SHA-1 is not present in the Android OAuth config. Register it in Firebase and download fresh config.")
    except (KeyError, TypeError, AttributeError, json.JSONDecodeError) as error:
        raise ValueError("Firebase Android configuration is malformed.") from error


def validate_backend_health(base, opener=urlopen):
    """The real workflow must confirm its configured HTTPS API before compilation.

    urllib uses normal certificate verification. A process health check does not
    prove authenticated Firebase/Sheets acceptance, which remains a separate test.
    """
    request = Request(base.rstrip("/") + "/health/live", headers={"Accept": "application/json"})
    try:
        with opener(request, timeout=60) as response:
            if response.status != 200:
                raise ValueError()
            final_url = urlsplit(response.geturl())
            if final_url.scheme != "https":
                raise ValueError()
            raw = response.read(65537)
            if len(raw) > 65536:
                raise ValueError()
            payload = json.loads(raw)
            if payload.get("data", {}).get("status") != "ok":
                raise ValueError()
    except Exception:
        # Do not emit request/redirect URLs, response bodies or upstream errors.
        raise ValueError("Backend HTTPS health check failed. Verify the configured API is deployed and reachable.") from None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mobile", type=Path, default=Path(__file__).resolve().parents[1] / "mobile")
    parser.add_argument("--check-backend", action="store_true",
                        help="Also verify the configured backend HTTPS health endpoint.")
    args = parser.parse_args()
    # Expo loads .env itself. This check deliberately reads process env, so the
    # same explicitly supplied values can be validated in CI and local shells.
    try:
        validate_configuration(os.environ, args.mobile)
        if args.check_backend:
            validate_backend_health(os.environ["EXPO_PUBLIC_API_BASE_URL"])
    except (ValueError, OSError) as error:
        parser.exit(1, "Android build blocked: " + str(error) + "\n")
    print("Android/Firebase configuration passed; native compilation is a separate check.")


if __name__ == "__main__":
    main()
