"""Factory lifecycle coverage with real file lease/checkpoint and controlled upstreams."""
from copy import deepcopy
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app.core.errors import IntegrityError
from tests.conftest import TestVerifier
from tests.support import MemoryRepository, NOW, transaction


def test_factory_reopen_retains_receipt_rejects_second_writer_and_truncation(config, tmp_path, monkeypatch):
    path = tmp_path / "durable-checkpoint.json"
    config = config.model_copy(update={"ledger_checkpoint_path": str(path)})
    store = MemoryRepository()
    monkeypatch.setattr(main, "SheetsRepository", lambda *args, **kwargs: store)
    monkeypatch.setattr(main, "FirebaseVerifier", lambda *args, **kwargs: TestVerifier())
    headers = {"Authorization": "Bearer test-owner", "Idempotency-Key": str(uuid4())}
    body = transaction()

    def app():
        return main.create_app(config, clock=lambda: NOW)

    with TestClient(app()) as first:
        response = first.post("/api/v1/transactions", json=body, headers=headers)
        assert response.status_code == 201
        original = response.json()["data"]
        assert path.is_file()
        # This factory path has not injected away the production ProcessLease.
        with pytest.raises(RuntimeError, match="owns the ledger lease"):
            with TestClient(app()):
                pass

    with TestClient(app()) as reopened:
        replay = reopened.post("/api/v1/transactions", json=body, headers=headers)
        assert replay.status_code == 200 and replay.json()["data"] == original
        assert len(store.rows) == 2

    valid = deepcopy(store.rows)
    store.rows = store.rows[:1]
    with pytest.raises(IntegrityError):
        with TestClient(app()):
            pass
    # A failed startup must release the lease so a corrected source can reopen.
    store.rows = valid
    with TestClient(app()) as corrected:
        assert corrected.get("/api/v1/transactions/" + body["id"], headers=headers).json()["data"] == original
