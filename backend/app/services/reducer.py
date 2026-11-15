import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime

from pydantic import ValidationError

from app.core.errors import AppError, IntegrityError
from app.schemas.commands import BudgetPut, PreferencesPut, TransactionCreate, iso_date, uuid_string
from app.services.domain import candidate, canonical, command_model, normalize, public_resource, semantic_hash

HEADERS = ["schema_version", "operation_id", "user_id", "entity_type", "entity_id", "action",
           "expected_revision", "normalized_command_json", "payload_json", "semantic_hash", "submitted_at"]


def strict_json(value):
    def unique(pairs):
        obj = {}
        for key, item in pairs:
            if key in obj:
                raise ValueError("Duplicate JSON key")
            obj[key] = item
        return obj
    return json.loads(value, object_pairs_hook=unique,
                      parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite number")))


def timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z", value):
        raise ValueError("UTC timestamp required")
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def integer_cell(value):
    if type(value) is int:
        return value
    if isinstance(value, str) and re.fullmatch(r"0|[1-9][0-9]*", value):
        return int(value)
    raise ValueError("Invalid integer cell")


@dataclass
class State:
    entities: dict = field(default_factory=dict)
    receipts: dict = field(default_factory=dict)
    rows_processed: int = 0

    def get(self, uid, kind, entity_id):
        return self.entities.get((uid, kind, entity_id))

    def active(self, uid, kind):
        return [r for (owner, k, _), r in self.entities.items()
                if owner == uid and k == kind and not r.get("deleted", False)]


def make_event(uid, key, kind, entity_id, action, expected, command, payload, now):
    return [1, key, uid, kind, entity_id, action, expected, canonical(command), canonical(payload),
            semantic_hash(uid, kind, entity_id, action, expected, command), now]


def rows_digest(rows):
    return hashlib.sha256(canonical(rows).encode()).hexdigest()


def validate_snapshot(kind, entity_id, action, command, payload):
    audit = {"revision", "created_at", "updated_at"}
    fields = set(payload) - audit
    if action == "DELETE":
        if fields != {"id", "deleted"} or payload["deleted"] is not True or payload["id"] != entity_id:
            raise IntegrityError()
    elif kind == "TRANSACTION":
        resource = {k: v for k, v in payload.items() if k not in audit}
        parsed = TransactionCreate.model_validate(resource).model_dump(mode="json")
        if canonical(parsed) != canonical(resource) or resource["id"] != entity_id:
            raise IntegrityError()
        for key, value in command.items():
            if key != "expected_revision" and canonical(resource[key]) != canonical(value):
                raise IntegrityError()
    elif kind in {"BUDGET_DEFAULT", "DAILY_BUDGET"}:
        target = "effective_from" if kind == "BUDGET_DEFAULT" else "date"
        BudgetPut.model_validate({"amount": payload["amount"], "expected_revision": 0})
        if fields != {target, "amount"} or payload[target] != entity_id or payload["amount"] != command["amount"]:
            raise IntegrityError()
    else:
        prefs = {k: v for k, v in payload.items() if k not in audit}
        PreferencesPut.model_validate({**prefs, "expected_revision": 0})
        if canonical(prefs) != canonical({k: v for k, v in command.items() if k != "expected_revision"}):
            raise IntegrityError()


def replay(rows):
    state = State()
    try:
        if not rows or rows[0] != HEADERS:
            raise IntegrityError()
        for row in rows[1:]:
            if len(row) != len(HEADERS):
                raise IntegrityError()
            version, key, uid, kind, entity_id, action, expected, cmd_json, payload_json, hash_, at = row
            if integer_cell(version) != 1 or not isinstance(uid, str) or not uid.strip():
                raise IntegrityError()
            if uuid_string(key) != key:
                raise IntegrityError()
            expected = integer_cell(expected)
            if expected < 0:
                raise IntegrityError()
            if kind == "TRANSACTION":
                if uuid_string(entity_id) != entity_id:
                    raise IntegrityError()
            elif kind in {"BUDGET_DEFAULT", "DAILY_BUDGET"}:
                iso_date(entity_id)
            elif kind != "PREFERENCES" or entity_id != "preferences":
                raise IntegrityError()
            command = strict_json(cmd_json)
            # Exact normalized representation is part of the storage schema.
            parsed = command_model(kind, action).model_validate(command)
            if canonical(normalize(parsed)) != canonical(command):
                raise IntegrityError()
            if action == "CREATE":
                if expected != 0 or command["id"] != entity_id:
                    raise IntegrityError()
            elif command["expected_revision"] != expected:
                raise IntegrityError()
            if semantic_hash(uid, kind, entity_id, action, expected, command) != hash_:
                raise IntegrityError()
            timestamp(at)
            payload = strict_json(payload_json)
            if not isinstance(payload, dict) or type(payload.get("revision")) is not int or payload["revision"] != expected + 1:
                raise IntegrityError()
            timestamp(payload["created_at"])
            timestamp(payload["updated_at"])
            if payload["updated_at"] != at or timestamp(payload["created_at"]) > timestamp(at):
                raise IntegrityError()
            validate_snapshot(kind, entity_id, action, command, payload)
            existing = state.receipts.get((uid, key))
            if existing:
                if existing["semantic_hash"] != hash_:
                    raise IntegrityError()
                # Duplicate occurrence's snapshot/audit is not the original receipt.
                continue
            previous = state.get(uid, kind, entity_id)
            try:
                result = candidate(kind, entity_id, action, command, previous, expected, at)
            except AppError as exc:
                if exc.status not in (404, 409):
                    raise IntegrityError() from exc
                receipt = {"operation_id": key, "status": "CONFLICT", "http_status": 409,
                           "error": {"code": "REVISION_CONFLICT", "message": "Data sudah berubah. Muat ulang sebelum menyimpan.",
                                     "fields": {"current_revision": previous["revision"] if previous else 0}}}
            else:
                if canonical(result) != canonical(payload):
                    raise IntegrityError()
                state.entities[(uid, kind, entity_id)] = result
                receipt = {"operation_id": key, "status": "APPLIED",
                           "http_status": 201 if action == "CREATE" else 200, "data": public_resource(result)}
            state.receipts[(uid, key)] = {**receipt, "semantic_hash": hash_}
        state.rows_processed = len(rows) - 1
        return state
    except (ValueError, TypeError, KeyError, ValidationError, OverflowError) as exc:
        raise IntegrityError() from exc
