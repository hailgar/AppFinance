from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.errors import WriteUnknown
from app.main import create_app
from tests.conftest import TestVerifier
from tests.support import NOW, transaction

BASE = "/api/v1"


def write(client, method, path, body=None, key=None):
    return client.request(method, BASE + path, json=body,
                          headers={"Idempotency-Key": key or str(uuid4())})


def get(client, path, **params):
    response = client.get(BASE + path, params=params)
    assert response.status_code == 200, response.text
    return response.json()["data"]


def test_full_money_flow_reload_edit_and_delete(client, repository, config):
    result = write(client, "PUT", "/budgets/defaults/2026-11-16", {"amount": 100000, "expected_revision": 0})
    assert result.status_code == 200
    body = transaction(note="=SUM(A1:A2)")
    response = write(client, "POST", "/transactions", body)
    assert response.status_code == 201
    expense = response.json()["data"]
    response = write(client, "POST", "/transactions", transaction(type="INCOME", amount=200000, category_code="INC_SALARY"))
    assert response.status_code == 201
    data = get(client, "/dashboard", date="2026-11-16")
    assert (data["remaining_amount"], data["usage_percent"], data["income_total"]) == (65000, 35, 200000)
    assert get(client, "/transactions/" + body["id"])["note"] == "=SUM(A1:A2)"
    # A new app/service reconstructs data from ledger rows, not a process dictionary.
    with TestClient(create_app(config, repository, TestVerifier(), clock=lambda: NOW),
                    headers={"Authorization": "Bearer test-owner"}) as restarted:
        assert get(restarted, "/dashboard", date="2026-11-16")["remaining_amount"] == 65000
    edited = write(client, "PATCH", "/transactions/" + expense["id"],
                   {"expected_revision": 1, "type": "INCOME", "category_code": "INC_BONUS", "transaction_date": "2026-11-15"})
    assert edited.status_code == 200
    assert get(client, "/dashboard", date="2026-11-16")["expense_total"] == 0
    assert get(client, "/dashboard", date="2026-11-15")["income_total"] == 35000
    summary = get(client, "/summary/monthly", month="2026-11")
    assert summary["income_total"] == 235000 and summary["expense_total"] == 0
    deleted = write(client, "DELETE", f'/transactions/{expense["id"]}?expected_revision=2')
    assert deleted.status_code == 200 and deleted.json()["data"]["revision"] == 3
    assert client.get(BASE + "/transactions/" + expense["id"]).status_code == 404
    assert get(client, "/summary/monthly", month="2026-11")["income_total"] == 200000
    assert write(client, "POST", "/transactions", body).status_code == 409


@pytest.mark.parametrize("amount", [-1, 0, 1.5, 1.0, True, "35000", None, 1_000_000_000_000])
def test_strict_amount(client, amount):
    response = write(client, "POST", "/transactions", transaction(amount=amount))
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "request_id" in response.json()


@pytest.mark.parametrize("changes", [
    {"transaction_date": "2026-11-17"}, {"transaction_date": "2025-11-14"},
    {"transaction_date": "2026-02-30"}, {"transaction_date": "20261116"},
    {"category_code": "INC_SALARY"}, {"category_code": "unknown"},
    {"note": "a" * 201}, {"user_id": "owner"}, {"type": "TRANSFER"},
])
def test_invalid_transaction(client, changes):
    assert write(client, "POST", "/transactions", transaction(**changes)).status_code == 422


def test_auth_and_owner_checks(client, repository):
    assert client.get(BASE + "/health/live", headers={"Authorization": ""}).status_code == 200
    for token, status in [("", 401), ("Bearer invalid", 401), ("Bearer test-other", 403)]:
        response = client.get(BASE + "/me", headers={"Authorization": token})
        assert response.status_code == status
    assert get(client, "/me")["currency"] == "IDR"
    # Add a different owner's valid rows directly through the domain test interface.
    from tests.support import service
    s = service(repository)
    model = transaction()
    from app.schemas.commands import TransactionCreate
    key = str(uuid4())
    s.mutate("other", key, "TRANSACTION", model["id"], "CREATE", 0, TransactionCreate(**model))
    assert client.get(BASE + "/transactions/" + model["id"]).status_code == 404
    assert write(client, "PATCH", "/transactions/" + model["id"], {"expected_revision": 1, "amount": 10}).status_code == 404
    assert write(client, "DELETE", f'/transactions/{model["id"]}?expected_revision=1').status_code == 404
    result = client.get(BASE + "/operations/" + key)
    assert result.status_code == 202 and result.json()["data"]["status"] == "UNKNOWN"
    assert get(client, "/transactions", **{"from": "2026-11-16", "to": "2026-11-16"})["items"] == []


def test_budget_null_zero_overrides_and_history(client):
    data = get(client, "/dashboard", date="2026-11-16")
    assert (data["budget_status"], data["remaining_amount"], data["usage_percent"]) == ("UNSET", None, None)
    assert write(client, "PUT", "/budgets/defaults/2026-11-16", {"amount": 0, "expected_revision": 0}).status_code == 200
    assert get(client, "/dashboard", date="2026-11-16")["budget_status"] == "AT_LIMIT"
    assert write(client, "POST", "/transactions", transaction(amount=120000)).status_code == 201
    data = get(client, "/dashboard", date="2026-11-16")
    assert data["remaining_amount"] == -120000 and data["usage_percent"] is None and data["budget_status"] == "OVER_BUDGET"
    assert write(client, "PUT", "/budgets/defaults/2026-11-17", {"amount": 200000, "expected_revision": 0}).status_code == 200
    assert get(client, "/budgets/effective", date="2026-11-16")["amount"] == 0
    assert get(client, "/budgets/effective", date="2026-11-17")["amount"] == 200000
    assert get(client, "/budgets/effective", date="2026-11-15")["amount"] is None
    assert write(client, "PUT", "/budgets/daily/2026-11-16", {"amount": 100000, "expected_revision": 0}).status_code == 200
    assert get(client, "/dashboard", date="2026-11-16")["usage_percent"] == 120
    assert write(client, "DELETE", "/budgets/daily/2026-11-16?expected_revision=1").status_code == 200
    effective = get(client, "/budgets/effective", date="2026-11-16")
    assert effective == {"amount": 0, "source": "DEFAULT", "effective_from": "2026-11-16", "override_active": False, "override_revision": 2}
    assert write(client, "PUT", "/budgets/daily/2026-11-16", {"amount": 1, "expected_revision": 0}).status_code == 409
    assert write(client, "PUT", "/budgets/daily/2026-11-16", {"amount": 200000, "expected_revision": 2}).json()["data"]["revision"] == 3
    assert [r["effective_from"] for r in get(client, "/budgets/defaults")["items"]] == ["2026-11-16", "2026-11-17"]


@pytest.mark.parametrize("path,body", [
    ("/budgets/defaults/2026-11-15", {"amount": 10, "expected_revision": 0}),
    ("/budgets/defaults/2027-11-18", {"amount": 10, "expected_revision": 0}),
    ("/budgets/daily/2027-11-18", {"amount": 10, "expected_revision": 0}),
    ("/budgets/daily/2026-11-16", {"amount": -1, "expected_revision": 0}),
    ("/budgets/daily/2026-11-16", {"amount": True, "expected_revision": 0}),
])
def test_invalid_budget(client, path, body):
    assert write(client, "PUT", path, body).status_code == 422


def test_preferences_validation_and_conflict(client):
    prefs = get(client, "/preferences")
    assert prefs["revision"] == 0 and prefs["budget_reminder"]["enabled"] is False
    body = {"budget_reminder": {"enabled": True, "time": "07:30"},
            "record_reminder": {"enabled": False, "time": "20:00"}, "expected_revision": 0}
    assert write(client, "PUT", "/preferences", body).status_code == 200
    assert get(client, "/preferences")["budget_reminder"]["time"] == "07:30"
    assert write(client, "PUT", "/preferences", body).status_code == 409
    assert write(client, "PUT", "/preferences", {**body, "expected_revision": True}).status_code == 422
    for value in ("24:00", "7:30", "20:60", "07:30\n"):
        bad = {**body, "expected_revision": 1, "budget_reminder": {"enabled": True, "time": value}}
        assert write(client, "PUT", "/preferences", bad).status_code == 422
    assert write(client, "PUT", "/preferences", {**body, "notification_id": "unsupported"}).status_code == 422


def test_idempotency_patch_presence_revision_and_unknown(client, repository):
    body = transaction(note="hello")
    assert write(client, "POST", "/transactions", body).status_code == 201
    path = "/transactions/" + body["id"]
    key = str(uuid4())
    patch = {"expected_revision": 1, "amount": 40000}
    original = write(client, "PATCH", path, patch, key).json()["data"]
    assert write(client, "PATCH", path, {"expected_revision": 2, "note": None}).status_code == 200
    replay = write(client, "PATCH", path, patch, key)
    assert replay.status_code == 200 and replay.json()["data"] == original
    assert write(client, "PATCH", path, {**patch, "note": None}, key).status_code == 409
    assert write(client, "PATCH", path, {"expected_revision": 3, "amount": None}).status_code == 422
    assert write(client, "PATCH", path, {"expected_revision": 3, "type": "INCOME"}).status_code == 422
    assert write(client, "PATCH", path, {"expected_revision": 1, "amount": 10}).status_code == 409
    assert write(client, "PATCH", path, {"expected_revision": 3}).status_code == 422
    repository.after_append = lambda: (_ for _ in ()).throw(WriteUnknown())
    key = str(uuid4())
    timed_out = write(client, "POST", "/transactions", transaction(), key)
    assert timed_out.status_code == 202
    assert get(client, "/operations/" + key)["status"] == "APPLIED"


def test_pagination_bound_to_filters_and_uid(client):
    for i in range(3):
        assert write(client, "POST", "/transactions", transaction(id=f"00000000-0000-0000-0000-{i:012}")).status_code == 201
    params = {"from": "2026-11-16", "to": "2026-11-16", "limit": 2}
    page = get(client, "/transactions", **params)
    assert len(page["items"]) == 2 and page["next_cursor"]
    second = get(client, "/transactions", **{**params, "cursor": page["next_cursor"]})
    assert len(second["items"]) == 1 and second["next_cursor"] is None
    assert not ({r["id"] for r in page["items"]} & {r["id"] for r in second["items"]})
    assert client.get(BASE + "/transactions", params={**params, "type": "EXPENSE", "cursor": page["next_cursor"]}).status_code == 422
    for extra in ({"cursor": "bad!"}, {"limit": 101}, {"from": "2026-11-17"}, {"from": "2025-11-15"}):
        assert client.get(BASE + "/transactions", params={**params, **extra}).status_code == 422


def test_concurrent_update_applies_once(client):
    body = transaction()
    write(client, "POST", "/transactions", body)
    def change(amount):
        return write(client, "PATCH", "/transactions/" + body["id"], {"expected_revision": 1, "amount": amount}).status_code
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(change, [50000, 60000]))
    assert sorted(results) == [200, 409]
    assert get(client, "/transactions/" + body["id"])["revision"] == 2


def test_wib_boundary_and_historical_replay(config, repository):
    # 17:30 UTC is already the next business day in Jakarta.
    instant = datetime(2026, 11, 15, 17, 30, tzinfo=timezone.utc)
    with TestClient(create_app(config, repository, TestVerifier(), clock=lambda: instant),
                    headers={"Authorization": "Bearer test-owner"}) as c:
        assert write(c, "POST", "/transactions", transaction(transaction_date="2026-11-16")).status_code == 201
        assert write(c, "POST", "/transactions", transaction(transaction_date="2025-11-15")).status_code == 201
    future = datetime(2028, 1, 1, tzinfo=timezone.utc)
    with TestClient(create_app(config, repository, TestVerifier(), clock=lambda: future)) as c:
        assert c.app.state.ledger.state().rows_processed == 2


def test_request_limits_and_contract_errors(client, config, repository):
    assert write(client, "POST", "/transactions", transaction(), key="bad").status_code == 422
    assert client.post(BASE + "/transactions", json=transaction()).status_code == 422
    assert client.request("DELETE", BASE + "/transactions/" + str(uuid4()), content=b"{}",
                         headers={"Idempotency-Key": str(uuid4())}).status_code == 422
    assert client.post(BASE + "/transactions", content=b"x" * 17000).status_code == 413
    assert client.get(BASE + "/missing").json()["error"]["code"] == "NOT_FOUND"
    assert client.get(BASE + "/summary/monthly", params={"month": "2026-13"}).status_code == 422
    assert client.get(BASE + "/summary/monthly", params={"month": "2026-12"}).status_code == 422
    limited = config.model_copy(update={"rate_limit_per_minute": 1})
    with TestClient(create_app(limited, repository, TestVerifier(), clock=lambda: NOW),
                    headers={"Authorization": "Bearer test-owner"}) as c:
        assert c.get(BASE + "/me").status_code == 200
        result = c.get(BASE + "/me")
        assert result.status_code == 429 and result.headers["Retry-After"] == "60"
        assert c.get(BASE + "/health/live").status_code == 200


def test_unexpected_upstream_details_are_not_exposed_or_logged(client, repository, caplog):
    from unittest.mock import Mock
    repository.read_rows = Mock(side_effect=ValueError("private-note-and-token-must-never-be-logged"))
    response = client.get(BASE + "/dashboard", params={"date": "2026-11-16"})
    assert response.status_code == 500
    assert response.json()["error"]["code"] == "INTERNAL_ERROR"
    assert "private-note-and-token" not in response.text + caplog.text
    assert response.headers["X-Request-ID"] == response.json()["request_id"]
