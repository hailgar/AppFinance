import json
from copy import deepcopy
from uuid import uuid4

import pytest

from app.core.errors import AppError, IntegrityError, WriteUnknown
from app.repositories.checkpoint import Checkpoint
from app.schemas.commands import TransactionCreate, TransactionPatch
from app.services.domain import candidate, normalize, stamp
from app.services.reducer import make_event, replay
from tests.support import NOW, service, transaction


def create(s, body=None, key=None):
    model = TransactionCreate(**(body or transaction()))
    key = key or str(uuid4())
    status, data = s.mutate("owner", key, "TRANSACTION", model.id, "CREATE", 0, model)
    return key, data, status


def test_create_retry_patch_receipt_and_restart():
    s = service()
    body = transaction()
    key, original, status = create(s, body)
    assert status == 201 and original["revision"] == 1
    patch = TransactionPatch(expected_revision=1, amount=50000)
    s.mutate("owner", str(uuid4()), "TRANSACTION", original["id"], "UPDATE", 1, patch)
    restarted = service(s.repository)
    _, receipt, status = create(restarted, body, key)
    assert status == 200 and receipt == original
    assert restarted.state().get("owner", "TRANSACTION", original["id"])["amount"] == 50000
    assert len(s.repository.rows) == 3


def test_physical_duplicates_and_changed_key():
    s = service()
    body = transaction()
    key, first, _ = create(s, body)
    duplicate = deepcopy(s.repository.rows[-1])
    duplicate[-1] = "2026-11-16T05:00:01.000000Z"
    payload = json.loads(duplicate[8])
    payload.update(created_at=duplicate[-1], updated_at=duplicate[-1])
    duplicate[8] = json.dumps(payload)
    s.repository.rows.append(duplicate)
    assert len(s.state(force=True).active("owner", "TRANSACTION")) == 1
    assert s.operation("owner", key)[1]["data"] == first
    with pytest.raises(AppError, match="IDEMPOTENCY_KEY_CONFLICT"):
        create(s, {**body, "amount": 123}, key)
    corrupt = deepcopy(s.repository.rows[-1])
    corrupt[9] = "0" * 64
    with pytest.raises(IntegrityError):
        replay(s.repository.rows + [corrupt])


def test_unknown_append_and_late_stale_event():
    s = service()
    _, original, _ = create(s)
    before = s.state().get("owner", "TRANSACTION", original["id"])
    late = TransactionPatch(expected_revision=1, amount=999)
    at = stamp(NOW)
    late_event = make_event("owner", str(uuid4()), "TRANSACTION", original["id"], "UPDATE", 1,
                           normalize(late), candidate("TRANSACTION", original["id"], "UPDATE", normalize(late), before, 1, at), at)
    s.repository.after_append = lambda: (_ for _ in ()).throw(WriteUnknown())
    fresh = TransactionPatch(expected_revision=1, amount=40000)
    key = str(uuid4())
    assert s.mutate("owner", key, "TRANSACTION", original["id"], "UPDATE", 1, fresh)[0] == 202
    assert s.operation("owner", key)[1]["status"] == "APPLIED"
    s.repository.rows.append(late_event)
    result = service(s.repository).state()
    assert result.get("owner", "TRANSACTION", original["id"])["amount"] == 40000
    assert result.receipts[("owner", late_event[1])]["status"] == "CONFLICT"


def test_snapshot_corruption_and_reordered_source(tmp_path):
    s = service()
    create(s)
    create(s)
    checkpoint = Checkpoint(tmp_path / "checkpoint.json", "sheet")
    checkpoint.save(s.repository.rows)
    checkpoint.verify(s.repository.rows)
    reordered = [s.repository.rows[0], s.repository.rows[2], s.repository.rows[1]]
    with pytest.raises(IntegrityError):
        checkpoint.verify(reordered)
    broken = deepcopy(s.repository.rows)
    payload = json.loads(broken[1][8])
    payload["amount"] += 1
    broken[1][8] = json.dumps(payload)
    with pytest.raises(IntegrityError):
        replay(broken)
