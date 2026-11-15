"""Opt-in only. Writes new events exclusively to an explicitly separate, empty test sheet."""
import os
from datetime import datetime
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.auth import FirebaseVerifier
from app.core.config import Settings
from app.main import create_app
from app.repositories.sheets import SheetsRepository
from app.services.domain import WIB
from app.services.reducer import HEADERS

pytestmark = [pytest.mark.integration, pytest.mark.skipif(os.getenv("RUN_SHEETS_INTEGRATION") != "1",
                                                        reason="Live Firebase/Sheets test is explicitly opt-in.")]


def test_real_firebase_sheet_write_and_reopen():
    source = Settings()
    target = os.getenv("TEST_GOOGLE_SHEETS_SPREADSHEET_ID", "")
    token = os.getenv("TEST_FIREBASE_ID_TOKEN", "")
    if not target or not token:
        pytest.fail("Set a separate TEST_GOOGLE_SHEETS_SPREADSHEET_ID and TEST_FIREBASE_ID_TOKEN.")
    assert target != source.google_sheets_spreadsheet_id, "Never use the configured source sheet as a test target."
    config = source.model_copy(update={"google_sheets_spreadsheet_id": target, "cache_ttl_seconds": 0, "app_env": "test"})
    def repo():
        return SheetsRepository(target, config.upstream_timeout_seconds, credentials_path=config.google_application_credentials)
    store = repo()
    store.bootstrap()
    assert store.read_rows() == [HEADERS], "Use a fresh empty test ledger; this test never clears it."
    headers = {"Authorization": "Bearer " + token}
    day = datetime.now(WIB).date().isoformat()
    body = {"id": str(uuid4()), "type": "EXPENSE", "amount": 35000, "category_code": "EXP_FOOD",
            "transaction_date": day, "note": "Uji integrasi test spreadsheet"}
    key = str(uuid4())
    with TestClient(create_app(config, store, FirebaseVerifier(config.firebase_project_id, config.google_application_credentials)),
                    headers=headers) as client:
        budget = client.put("/api/v1/budgets/defaults/" + day, json={"amount": 100000, "expected_revision": 0},
                            headers={"Idempotency-Key": str(uuid4())})
        assert budget.status_code == 200
        first = client.post("/api/v1/transactions", json=body, headers={"Idempotency-Key": key})
        assert first.status_code == 201
        second = client.post("/api/v1/transactions", json=body, headers={"Idempotency-Key": key})
        assert second.status_code == 200 and second.json()["data"] == first.json()["data"]
    with TestClient(create_app(config, repo(), FirebaseVerifier(config.firebase_project_id, config.google_application_credentials)),
                    headers=headers) as reopened:
        data = reopened.get("/api/v1/dashboard", params={"date": day})
        assert data.status_code == 200 and data.json()["data"]["remaining_amount"] == 65000
        assert reopened.get("/api/v1/transactions/" + body["id"]).json()["data"]["amount"] == 35000
