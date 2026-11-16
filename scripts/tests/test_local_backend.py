"""Local preflight boundaries only; no Google credential or network requests."""
import importlib.util
import os
from pathlib import Path
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("local_backend", ROOT / "scripts/local_backend.py")
runner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(runner)


def preflight(tmp_path, **overrides):
    backend = tmp_path / "repository" / "backend"
    backend.mkdir(parents=True)
    # A deliberately invalid credential file: config checks must never use it.
    key = tmp_path / "not-real-credential.json"
    key.write_text("NOT_A_REAL_GOOGLE_CREDENTIAL", encoding="utf-8")
    values = {
        "GOOGLE_APPLICATION_CREDENTIALS": str(key),
        "GOOGLE_SHEETS_SPREADSHEET_ID": "local-config-check-only",
        "FIREBASE_PROJECT_ID": "local-config-check-only",
        "ALLOWED_FIREBASE_UID": "local-config-check-only",
        "APP_ENV": "development",
        "WEB_CONCURRENCY": "1",
        "UVICORN_WORKERS": "1",
        "RATE_LIMIT_PER_MINUTE": "120",
    }
    values.update(overrides)
    env = {key: value for key, value in os.environ.items() if not key.startswith(("FIREBASE_", "GOOGLE_"))}
    env.pop("FIREBASE_AUTH_EMULATOR_HOST", None)
    env.update(values, PYTHONPATH=str(ROOT / "backend"), PYTHONUTF8="1")
    return subprocess.run([sys.executable, "-c", runner.PREFLIGHT], cwd=backend, env=env,
                          text=True, capture_output=True, timeout=15)


def test_check_does_not_claim_real_google_access(tmp_path):
    result = preflight(tmp_path)
    assert result.returncode == 0
    assert "akses Firebase/Sheets belum diuji" in result.stdout
    assert "NOT_A_REAL_GOOGLE_CREDENTIAL" not in result.stdout + result.stderr


def test_invalid_config_reports_names_without_input_values(tmp_path):
    result = preflight(tmp_path, RATE_LIMIT_PER_MINUTE="PRIVATE_VALUE_SENTINEL")
    assert result.returncode != 0
    assert "RATE_LIMIT_PER_MINUTE" in result.stderr
    assert "PRIVATE_VALUE_SENTINEL" not in result.stdout + result.stderr


def test_placeholder_uid_blocks_startup(tmp_path):
    result = preflight(tmp_path, ALLOWED_FIREBASE_UID="replace_with_one_firebase_uid")
    assert result.returncode != 0
    assert "Isi ALLOWED_FIREBASE_UID" in result.stderr


def test_missing_credential_blocks_startup_without_logging_path(tmp_path):
    result = preflight(tmp_path, GOOGLE_APPLICATION_CREDENTIALS=str(tmp_path / "PRIVATE_PATH_SENTINEL"))
    assert result.returncode != 0
    assert "GOOGLE_APPLICATION_CREDENTIALS" in result.stderr
    assert "PRIVATE_PATH_SENTINEL" not in result.stdout + result.stderr


def test_credential_inside_repository_blocks_startup(tmp_path):
    key = tmp_path / "repository" / "wrong-key.json"
    key.parent.mkdir()
    key.write_text("NOT_A_REAL_GOOGLE_CREDENTIAL", encoding="utf-8")
    result = preflight(tmp_path, GOOGLE_APPLICATION_CREDENTIALS=str(key))
    assert result.returncode != 0
    assert "ke luar folder repository" in result.stderr
