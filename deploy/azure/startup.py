"""Azure's built-in Python runtime. One writer and a durable /home checkpoint.

Service account JSON comes from protected App Settings, never from the ZIP.
No settings or upstream exception text is printed.
"""
import json
import os
import tempfile
from pathlib import Path


def prepare_credentials(env=os.environ):
    raw = env.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    if not raw:
        raise RuntimeError("Configure GOOGLE_SERVICE_ACCOUNT_JSON in Azure App Settings.")
    try:
        value = json.loads(raw)
        valid = (isinstance(value, dict) and value.get("type") == "service_account"
                 and all(isinstance(value.get(key), str) and value[key].strip()
                         for key in ("project_id", "private_key", "client_email")))
        if not valid:
            raise ValueError()
    except (ValueError, TypeError):
        raise RuntimeError("Invalid backend service-account configuration.") from None
    if value["project_id"] != env.get("FIREBASE_PROJECT_ID"):
        raise RuntimeError("Backend service account and Firebase project must match.")
    checkpoint = Path(env.get("LEDGER_CHECKPOINT_PATH", "")).resolve()
    if not checkpoint.is_absolute() or not checkpoint.is_relative_to("/home/catat-data"):
        raise RuntimeError("Azure checkpoint must be under /home/catat-data.")
    descriptor, name = tempfile.mkstemp(prefix="catat-google-", suffix=".json")
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            stream.write(raw)
        os.chmod(name, 0o600)
    except BaseException:
        Path(name).unlink(missing_ok=True)
        raise
    env["GOOGLE_APPLICATION_CREDENTIALS"] = name
    return Path(name)


def main():
    credential = prepare_credentials()
    try:
        import uvicorn
        uvicorn.run("app.main:create_app", factory=True, host="0.0.0.0", port=8000,
                    workers=1, access_log=False)
    finally:
        credential.unlink(missing_ok=True)


if __name__ == "__main__":
    main()
