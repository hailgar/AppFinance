"""Loopback-only HTTP fixture for the mobile client's contract tests.

Run from backend/: python -m tests.serve_mobile_contract
Fake authentication and in-memory storage are confined to this test entry point.
Never expose this server on a public interface or use it with personal data.
"""
import uvicorn

from app.core.config import Settings
from app.main import create_app
from tests.conftest import TestVerifier
from tests.support import MemoryRepository, NOW


def main():
    settings = Settings(
        google_sheets_spreadsheet_id="mobile-contract-test",
        firebase_project_id="mobile-contract-test",
        allowed_firebase_uid="owner",
        app_env="test",
        cache_ttl_seconds=0,
        rate_limit_per_minute=10000,
        log_level="WARNING",
        _env_file=None,
    )
    app = create_app(settings, MemoryRepository(), TestVerifier(), clock=lambda: NOW)
    uvicorn.run(app, host="127.0.0.1", port=8765, access_log=False, log_level="warning")


if __name__ == "__main__":
    main()
