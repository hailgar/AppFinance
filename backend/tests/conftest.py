import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.core.errors import AppError
from app.main import create_app
from tests.support import MemoryRepository, NOW


class TestVerifier:
    __test__ = False

    def verify(self, token):
        if token not in {"test-owner", "test-other"}:
            raise AppError(401, "UNAUTHENTICATED", "Token tidak valid.")
        return {"uid": "owner" if token == "test-owner" else "other", "name": "Test"}


@pytest.fixture
def config():
    return Settings(google_sheets_spreadsheet_id="test-spreadsheet", firebase_project_id="test-project",
                    allowed_firebase_uid="owner", app_env="test", cache_ttl_seconds=0, rate_limit_per_minute=10000,
                    _env_file=None)


@pytest.fixture
def repository():
    return MemoryRepository()


@pytest.fixture
def client(config, repository):
    app = create_app(config, repository, TestVerifier(), clock=lambda: NOW)
    with TestClient(app, headers={"Authorization": "Bearer test-owner"}) as c:
        yield c
