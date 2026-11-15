import hashlib
import json
from copy import deepcopy
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.core.errors import AppError, invalid
from app.schemas.commands import BudgetPut, DeleteCommand, PreferencesPut, TransactionCreate, TransactionPatch

WIB = ZoneInfo("Asia/Jakarta")
TRANSACTION_FIELDS = {"id", "type", "amount", "category_code", "transaction_date", "note"}
DEFAULT_PREFERENCES = {
    "budget_reminder": {"enabled": False, "time": "08:00"},
    "record_reminder": {"enabled": False, "time": "20:00"}, "revision": 0,
}


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False)


def utc_now():
    return datetime.now(timezone.utc)


def stamp(now):
    return now.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def semantic_hash(uid, kind, entity_id, action, revision, command):
    value = {"user_id": uid, "entity_type": kind, "entity_id": entity_id, "action": action,
             "expected_revision": revision, "normalized_command": command}
    return hashlib.sha256(canonical(value).encode()).hexdigest()


def command_model(kind, action):
    if (kind, action) == ("TRANSACTION", "CREATE"):
        return TransactionCreate
    if (kind, action) == ("TRANSACTION", "UPDATE"):
        return TransactionPatch
    if kind in {"TRANSACTION", "DAILY_BUDGET"} and action == "DELETE":
        return DeleteCommand
    if kind in {"BUDGET_DEFAULT", "DAILY_BUDGET"} and action == "UPSERT":
        return BudgetPut
    if (kind, action) == ("PREFERENCES", "UPSERT"):
        return PreferencesPut
    raise ValueError("Unknown entity/action")


def normalize(model):
    # Keep PATCH field presence, including explicit note=null. Other commands have defaults normalized.
    return model.model_dump(mode="json", exclude_unset=isinstance(model, TransactionPatch))


def window(value, today, past=366, future=0, field="date"):
    d = date.fromisoformat(value)
    if not today - timedelta(days=past) <= d <= today + timedelta(days=future):
        raise invalid(field, "Tanggal di luar rentang yang diizinkan.")
    return d


def ensure_lifecycle(kind, action, previous, expected):
    revision = previous["revision"] if previous else 0
    deleted = previous is not None and previous.get("deleted", False)
    if kind == "TRANSACTION" and action != "CREATE" and (previous is None or deleted):
        raise AppError(404, "NOT_FOUND", "Data tidak ditemukan.")
    if revision != expected or (action == "CREATE" and previous is not None):
        raise AppError(409, "REVISION_CONFLICT", "Data sudah berubah. Muat ulang sebelum menyimpan.",
                       {"current_revision": revision})
    if action == "DELETE" and (previous is None or deleted):
        raise AppError(404, "NOT_FOUND", "Data tidak ditemukan.")


def candidate(kind, entity_id, action, command, previous, expected, submitted_at, check_dates=True):
    """Pure transition shared by writer and reducer, never uses today's settings for history."""
    ensure_lifecycle(kind, action, previous, expected)
    today = datetime.fromisoformat(submitted_at.replace("Z", "+00:00")).astimezone(WIB).date()
    audit = {"revision": expected + 1,
             "created_at": previous["created_at"] if previous else submitted_at, "updated_at": submitted_at}
    if action == "DELETE":
        return {"id": entity_id, "deleted": True, **audit}
    if kind == "TRANSACTION":
        if action == "CREATE":
            resource = dict(command)
            if resource["id"] != entity_id or expected != 0:
                raise invalid("id")
        else:
            resource = {k: deepcopy(v) for k, v in previous.items() if k in TRANSACTION_FIELDS}
            resource.update({k: v for k, v in command.items() if k != "expected_revision"})
        resource = TransactionCreate.model_validate(resource).model_dump(mode="json")
        if check_dates:
            window(resource["transaction_date"], today, field="transaction_date")
        return {**resource, **audit}
    if kind in {"BUDGET_DEFAULT", "DAILY_BUDGET"}:
        if check_dates:
            window(entity_id, today, past=0 if kind == "BUDGET_DEFAULT" else 366, future=366)
        field = "effective_from" if kind == "BUDGET_DEFAULT" else "date"
        return {field: entity_id, "amount": command["amount"], **audit}
    if kind == "PREFERENCES" and entity_id == "preferences":
        return {"budget_reminder": deepcopy(command["budget_reminder"]),
                "record_reminder": deepcopy(command["record_reminder"]), **audit}
    raise ValueError("Unknown target")


def public_resource(resource):
    if resource.get("deleted"):
        return {k: resource[k] for k in ("id", "deleted", "revision")}
    # Preferences in the contract carry only reminder fields and revision.
    if "budget_reminder" in resource:
        return {k: deepcopy(resource[k]) for k in ("budget_reminder", "record_reminder", "revision")}
    return deepcopy(resource)
