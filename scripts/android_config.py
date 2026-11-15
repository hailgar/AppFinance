"""Validate actual Android/Firebase build configuration without logging its contents."""
import argparse
import json
import os
from pathlib import Path
from urllib.parse import urlsplit


def validate_configuration(env, mobile):
    base = env.get("EXPO_PUBLIC_API_BASE_URL", "")
    try:
        url = urlsplit(base)
        valid_url = (url.scheme == "https" and url.hostname and not url.username and
                     not url.password and not url.query and not url.fragment and
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
        if signing_sha1 and not any(c.get("client_type") == 1 and
            c.get("android_info", {}).get("package_name") == package and
            c.get("android_info", {}).get("certificate_hash", "").replace(":", "").upper() == signing_sha1
            for c in oauth):
            raise ValueError("Signing SHA-1 is not present in the Android OAuth config. Register it in Firebase and download fresh config.")
    except (KeyError, TypeError, AttributeError, json.JSONDecodeError) as error:
        raise ValueError("Firebase Android configuration is malformed.") from error


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mobile", type=Path, default=Path(__file__).resolve().parents[1] / "mobile")
    args = parser.parse_args()
    # Expo loads .env itself. This check deliberately reads process env, so the
    # same explicitly supplied values can be validated in CI and local shells.
    try:
        validate_configuration(os.environ, args.mobile)
    except (ValueError, OSError) as error:
        parser.exit(1, "Android build blocked: " + str(error) + "\n")
    print("Android/Firebase configuration passed; native compilation is a separate check.")


if __name__ == "__main__":
    main()
