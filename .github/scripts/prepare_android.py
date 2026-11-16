"""Decode build secrets only into runner temp; no secret values in logs or Git."""
import base64
import os
from pathlib import Path

required = ["GOOGLE_SERVICES_JSON_BASE64", "ANDROID_KEYSTORE_BASE64", "ANDROID_STORE_PASSWORD",
            "ANDROID_KEY_ALIAS", "ANDROID_KEY_PASSWORD", "EXPO_PUBLIC_API_BASE_URL", "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID"]
missing = [name for name in required if not os.environ.get(name)]
if missing:
    raise SystemExit("Missing Android build configuration: " + ", ".join(missing))
folder = Path(os.environ["RUNNER_TEMP"]) / "catat-android"
folder.mkdir(mode=0o700, exist_ok=True)
paths = {}
for source, name, key in [("GOOGLE_SERVICES_JSON_BASE64", "google-services.json", "GOOGLE_SERVICES_FILE"),
                          ("ANDROID_KEYSTORE_BASE64", "internal.keystore", "ANDROID_KEYSTORE_PATH")]:
    try:
        contents = base64.b64decode(os.environ[source], validate=True)
    except ValueError:
        raise SystemExit("Invalid base64 in " + source) from None
    path = folder / name
    path.write_bytes(contents)
    path.chmod(0o600)
    paths[key] = str(path)
with open(os.environ["GITHUB_ENV"], "a") as output:
    for name, path in paths.items():
        output.write(name + "=" + path + "\n")
print("Build configuration prepared in temporary files.")
