import json
from copy import deepcopy
from unittest.mock import Mock, patch
from uuid import uuid4

import pytest
import requests

from app.core.errors import IntegrityError, StorageUnavailable, WriteUnknown
from app.repositories.checkpoint import Checkpoint, ProcessLease
from app.repositories.sheets import ALL_HEADERS, SheetsRepository
from app.schemas.commands import TransactionCreate, TransactionPatch
from app.services.domain import candidate, normalize, stamp
from app.services.projections import rebuild
from app.services.reducer import HEADERS, make_event, replay
from scripts.admin import backup_payload, read_backup, restore_empty
from tests.support import NOW, MemoryRepository, service, transaction
from tests.test_ledger import create


def response(status, body=None):
    r = Mock(status_code=status)
    r.json.return_value = body or {}
    return r


def repository(*replies):
    session = Mock()
    session.request.side_effect = replies
    return SheetsRepository("test-spreadsheet", session=session), session


def test_append_uses_raw_and_does_not_retry_unknown():
    repo, session = repository(requests.Timeout())
    with pytest.raises(WriteUnknown):
        repo.append(["=SUM(A1:A2)"])
    assert session.request.call_count == 1
    params = session.request.call_args.kwargs["params"]
    assert params["valueInputOption"] == "RAW" and params["insertDataOption"] == "INSERT_ROWS"
    assert session.request.call_args.kwargs["timeout"] == 10
    for code in (500, 502, 504):
        repo, session = repository(response(code))
        with pytest.raises(WriteUnknown):
            repo.append(["row"])
        assert session.request.call_count == 1


def test_busy_mapping_and_bounded_read_backoff():
    repo, session = repository(response(429), response(503), response(200, {"values": [HEADERS]}))
    with patch("app.repositories.sheets.time.sleep") as sleep:
        assert repo.read_rows() == [HEADERS]
    assert sleep.call_count == 2 and session.request.call_count == 3
    repo, _ = repository(response(429))
    with pytest.raises(StorageUnavailable) as exc:
        repo.append(["row"])
    assert exc.value.code == "STORAGE_BUSY" and exc.value.headers["Retry-After"] == "3"


def test_bootstrap_is_nondestructive_and_rejects_unknown_schema():
    repo, session = repository(response(200, {"sheets": []}), response(200), *[response(200)] * 5)
    repo.bootstrap()
    mutations = [call for call in session.request.call_args_list if call.args[0] != "GET"]
    assert len(mutations) == 6
    for call in mutations:
        assert "clear" not in call.args[1] and "delete" not in str(call.kwargs.get("json", {})).lower()
    props = {"sheets": [{"properties": {"title": "LedgerEvents"}}]}
    repo, session = repository(response(200, props), response(200, {"values": [["unknown"]]}))
    with pytest.raises(IntegrityError):
        repo.bootstrap()
    assert all(call.args[0] == "GET" for call in session.request.call_args_list)


def test_corrupt_headers_hash_json_snapshot_and_revision():
    s = service()
    create(s)
    valid = s.repository.rows
    variants = []
    for index, replacement in [(0, 2), (6, True), (7, '{"id":"x","id":"y"}'),
                                (8, "NaN"), (9, "0" * 64), (10, "2026-11-16")]:
        rows = deepcopy(valid)
        rows[1][index] = replacement
        variants.append(rows)
    variants.extend([[["wrong"]] + valid[1:], valid + [[]], [HEADERS + ["unexpected"]] + valid[1:]])
    for rows in variants:
        with pytest.raises(IntegrityError):
            replay(rows)


def test_invalid_conflict_snapshot_is_still_integrity_failure():
    s = service()
    _, item, _ = create(s)
    original = s.state().get("owner", "TRANSACTION", item["id"])
    cmd = TransactionPatch(expected_revision=1, amount=2)
    at = stamp(NOW)
    payload = candidate("TRANSACTION", item["id"], "UPDATE", normalize(cmd), original, 1, at)
    late = make_event("owner", str(uuid4()), "TRANSACTION", item["id"], "UPDATE", 1, normalize(cmd), payload, at)
    s.mutate("owner", str(uuid4()), "TRANSACTION", item["id"], "UPDATE", 1, TransactionPatch(expected_revision=1, amount=3))
    payload["amount"] = "2"
    late[8] = json.dumps(payload)
    with pytest.raises(IntegrityError):
        replay(s.repository.rows + [late])


def test_different_hash_reuse_in_ledger_is_integrity_failure():
    s = service()
    key, _, _ = create(s)
    other = service()
    create(other, key=key)
    with pytest.raises(IntegrityError):
        replay(s.repository.rows + other.repository.rows[1:])


def test_pending_write_duplicate_arrives_late_and_is_not_counted_twice():
    class Delayed(MemoryRepository):
        def __init__(self):
            super().__init__()
            self.pending = None

        def append(self, row):
            if self.pending is None:
                self.pending = deepcopy(row)
                raise WriteUnknown()
            self.rows.append(deepcopy(row))
            self.rows.append(self.pending)
    repo = Delayed()
    s = service(repo)
    body = transaction()
    model = TransactionCreate(**body)
    key = str(uuid4())
    assert s.mutate("owner", key, "TRANSACTION", body["id"], "CREATE", 0, model)[0] == 202
    assert s.operation("owner", key)[0] == 202
    assert s.mutate("owner", key, "TRANSACTION", body["id"], "CREATE", 0, model)[0] == 201
    assert len(s.state().active("owner", "TRANSACTION")) == 1
    assert service(repo).state().rows_processed == 2


def test_uncertain_read_after_append_and_integrity_fail_closed():
    repo = MemoryRepository()
    s = service(repo)
    body = transaction()
    original_read = repo.read_rows
    repo.after_append = lambda: setattr(repo, "read_rows", Mock(side_effect=StorageUnavailable()))
    key = str(uuid4())
    assert s.mutate("owner", key, "TRANSACTION", body["id"], "CREATE", 0, TransactionCreate(**body))[0] == 202
    assert s.operation("owner", key)[0] == 202
    repo.read_rows = original_read
    assert s.operation("owner", key)[1]["status"] == "APPLIED"
    repo.rows[0] = ["wrong"]
    for _ in range(2):
        with pytest.raises(IntegrityError):
            s.state(force=True)
    assert s._state is None


def test_checkpoint_restart_truncate_and_process_lease(tmp_path):
    path = tmp_path / "ledger.json"
    cp = Checkpoint(path, "test-sheet")
    s = service()
    create(s)
    cp.save(s.repository.rows)
    Checkpoint(path, "test-sheet").verify(s.repository.rows)
    with pytest.raises(IntegrityError):
        cp.verify([HEADERS])
    with pytest.raises(IntegrityError):
        Checkpoint(path, "wrong-sheet").verify(s.repository.rows)
    first = ProcessLease(path)
    try:
        with pytest.raises(RuntimeError):
            ProcessLease(path)
    finally:
        first.close()
    ProcessLease(path).close()


def test_backup_restore_order_and_projection_failure(tmp_path):
    s = service()
    key, item, _ = create(s)
    backup = backup_payload(s.repository.rows, "source-sheet")
    path = tmp_path / "backup.json"
    path.write_text(json.dumps(backup))
    assert read_backup(path)["rows"] == s.repository.rows
    target = Mock(spreadsheet_id="new-test-sheet")
    target.read_rows.side_effect = [[HEADERS], s.repository.rows]
    restore_empty(target, backup)
    assert target.request.call_args.kwargs["json"]["values"] == s.repository.rows[1:]
    populated = Mock(spreadsheet_id="new-test-sheet")
    populated.read_rows.return_value = s.repository.rows
    with pytest.raises(RuntimeError):
        restore_empty(populated, backup)
    populated.request.assert_not_called()
    projection_repo = Mock()
    projection_repo.replace_views.side_effect = [None, StorageUnavailable(), None]
    with pytest.raises(StorageUnavailable):
        rebuild(projection_repo, s.state(), "owner", stamp(NOW))
    assert projection_repo.replace_views.call_args.args[0]["Metadata"][1][-1] == "FAILED_RETRY_REQUIRED"
    assert s.operation("owner", key)[1]["status"] == "APPLIED"
    assert SheetsRepository.cell("=SUM(A1:A2)") == {"userEnteredValue": {"stringValue": "=SUM(A1:A2)"}}
