import time
from copy import deepcopy
from uuid import uuid4

from fastapi.testclient import TestClient

from app.core.errors import StorageUnavailable, WriteUnknown
from app.main import create_app
from app.schemas.commands import TransactionCreate
from app.services.ledger import LedgerService
from app.services.projections import ProjectionManager
from tests.conftest import TestVerifier
from tests.support import MemoryRepository, NOW, transaction
from tests.test_api import get, write


class FailingReports(MemoryRepository):
    def __init__(self):
        super().__init__()
        self.fail = False

    def replace_views(self, tables):
        if self.fail and "TransactionsView" in tables:
            raise StorageUnavailable()
        super().replace_views(tables)


def test_api_refreshes_reports_from_effective_state_after_edit_delete_and_preferences(client, repository):
    assert repository.views["Metadata"][1][-1] == "OK"
    assert repository.views["TransactionsView"][1:] == []
    body = transaction(note="=SUM(A1:A2)")
    assert write(client, "POST", "/transactions", body).status_code == 201
    row = repository.views["TransactionsView"][1]
    assert row[:6] == [body["id"], "2026-11-16", "EXPENSE", 35000, "Makan & Minum", "=SUM(A1:A2)"]
    assert write(client, "PATCH", "/transactions/" + body["id"],
                 {"amount": 40000, "expected_revision": 1}).status_code == 200
    assert repository.views["TransactionsView"][1][3] == 40000
    assert write(client, "DELETE", "/transactions/" + body["id"] + "?expected_revision=2").status_code == 200
    assert repository.views["TransactionsView"][1:] == []
    assert write(client, "PUT", "/budgets/daily/2026-11-16", {"amount": 0, "expected_revision": 0}).status_code == 200
    assert repository.views["BudgetsView"][1][:3] == ["DAILY_BUDGET", "2026-11-16", 0]
    prefs = {"budget_reminder": {"enabled": True, "time": "07:30"},
             "record_reminder": {"enabled": False, "time": "20:00"}, "expected_revision": 0}
    assert write(client, "PUT", "/preferences", prefs).status_code == 200
    assert repository.views["PreferencesView"][1] == ["budget_reminder", True, "07:30", 1]
    status = get(client, "/storage/status")
    assert status["status"] == "OK" and status["source_rows_processed"] == status["projected_rows_processed"] == 5
    assert client.get("/api/v1/storage/status", headers={"Authorization": "Bearer test-other"}).status_code == 403
    assert client.get("/api/v1/storage/status", headers={"Authorization": ""}).status_code == 401


def test_report_failure_preserves_applied_receipt_and_retry_never_appends_another_event():
    repo = FailingReports()
    tick = [0.0]
    manager = ProjectionManager(repo, "owner", retry_seconds=30, monotonic=lambda: tick[0])
    ledger = LedgerService(repo, ttl=0, clock=lambda: NOW, projection=manager)
    ledger.state(force=True)
    repo.fail = True
    body, key = transaction(), str(uuid4())
    status, result = ledger.mutate("owner", key, "TRANSACTION", body["id"], "CREATE", 0, TransactionCreate(**body))
    assert status == 201 and result["revision"] == 1
    assert repo.views["Metadata"][1][-1] == "FAILED_RETRY_REQUIRED"
    assert ledger.operation("owner", key)[1]["status"] == "APPLIED"
    assert manager.status()["status"] == "FAILED_RETRY_REQUIRED"
    assert manager.status()["retry_after_seconds"] == 30
    writes = repo.view_writes
    repo.fail = False
    ledger.refresh_projections()  # Do not hammer quota while waiting for the bounded retry.
    assert repo.view_writes == writes
    tick[0] = 31
    ledger.refresh_projections()
    assert manager.status()["status"] == "OK"
    assert repo.views["TransactionsView"][1][0] == body["id"]
    assert len(repo.rows) == 2
    # Idempotent receipt replay must not append or duplicate a report transaction.
    assert ledger.mutate("owner", key, "TRANSACTION", body["id"], "CREATE", 0, TransactionCreate(**body))[0] == 200
    assert len(repo.rows) == 2 and len(repo.views["TransactionsView"]) == 2


def test_late_unknown_append_is_projected_when_worker_replays_source():
    class Delayed(MemoryRepository):
        def append(self, row):
            self.delayed = deepcopy(row)
            raise WriteUnknown()

    repo = Delayed()
    manager = ProjectionManager(repo, "owner")
    ledger = LedgerService(repo, ttl=0, clock=lambda: NOW, projection=manager)
    ledger.state()
    body, key = transaction(), str(uuid4())
    assert ledger.mutate("owner", key, "TRANSACTION", body["id"], "CREATE", 0, TransactionCreate(**body))[0] == 202
    assert repo.views["TransactionsView"][1:] == []
    repo.rows.append(repo.delayed)  # Arrives after the timed-out request returned.
    ledger.refresh_projections()
    assert repo.views["TransactionsView"][1][0] == body["id"]
    assert ledger.operation("owner", key)[1]["status"] == "APPLIED"


def test_lifespan_worker_repairs_reports_without_another_client_request(config):
    repo = FailingReports()
    repo.fail = True
    settings = config.model_copy(update={"projection_retry_seconds": 0.02})  # Fast clock only in this test.
    with TestClient(create_app(settings, repo, TestVerifier(), clock=lambda: NOW)) as client:
        assert client.app.state.ledger.projection.status()["status"] == "FAILED_RETRY_REQUIRED"
        repo.fail = False
        deadline = time.monotonic() + 2
        while client.app.state.ledger.projection.status()["status"] != "OK" and time.monotonic() < deadline:
            time.sleep(0.01)
        assert client.app.state.ledger.projection.status()["status"] == "OK"
        assert repo.views["Metadata"][1][-1] == "OK"


def test_projection_failure_logs_no_upstream_exception_payload(caplog):
    class PrivateFailure(MemoryRepository):
        def replace_views(self, tables):
            raise ValueError("private-note-and-token")

    manager = ProjectionManager(PrivateFailure(), "owner")
    ledger = LedgerService(manager.repository, ttl=0, clock=lambda: NOW, projection=manager)
    ledger.state()
    assert manager.status()["last_error_code"] == "PROJECTION_ERROR"
    assert "PROJECTION_ERROR" in caplog.text
    assert "private-note-and-token" not in caplog.text
