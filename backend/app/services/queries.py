import base64
import hashlib
import re
from copy import deepcopy
from datetime import date, timedelta

from app.core.errors import AppError, invalid
from app.schemas.commands import KINDS, iso_date, uuid_string
from app.services.domain import DEFAULT_PREFERENCES, WIB, canonical, public_resource, window
from app.services.reducer import strict_json


class Queries:
    def __init__(self, ledger):
        self.ledger = ledger

    def today(self):
        return self.ledger.clock().astimezone(WIB).date()

    def get_transaction(self, uid, entity_id):
        item = self.ledger.state().get(uid, "TRANSACTION", entity_id)
        if item is None or item.get("deleted"):
            raise AppError(404, "NOT_FOUND", "Data tidak ditemukan.")
        return public_resource(item)

    @staticmethod
    def ordered(items):
        return sorted(items, key=lambda r: (r["transaction_date"], r["id"]), reverse=True)

    def effective(self, uid, day, state=None):
        window(day, self.today(), future=366)
        state = state or self.ledger.state()
        override = state.get(uid, "DAILY_BUDGET", day)
        defaults = [r for r in state.active(uid, "BUDGET_DEFAULT") if r["effective_from"] <= day]
        fallback = max(defaults, key=lambda r: r["effective_from"], default=None)
        active = override is not None and not override.get("deleted", False)
        chosen = override if active else fallback
        return {"amount": chosen["amount"] if chosen else None,
                "source": "OVERRIDE" if active else "DEFAULT" if fallback else "UNSET",
                "effective_from": fallback["effective_from"] if fallback and not active else None,
                "override_active": active, "override_revision": override["revision"] if override else 0}

    def dashboard(self, uid, day):
        window(day, self.today())
        state = self.ledger.state()
        budget = self.effective(uid, day, state)
        items = [r for r in state.active(uid, "TRANSACTION") if r["transaction_date"] == day]
        expense = sum(r["amount"] for r in items if r["type"] == "EXPENSE")
        income = sum(r["amount"] for r in items if r["type"] == "INCOME")
        amount = budget["amount"]
        remaining = None if amount is None else amount - expense
        status = "UNSET" if amount is None else "WITHIN_BUDGET" if remaining > 0 else "AT_LIMIT" if remaining == 0 else "OVER_BUDGET"
        return {"date": day, "timezone": "Asia/Jakarta", "budget_amount": amount,
                "budget_source": budget["source"], "expense_total": expense, "income_total": income,
                "remaining_amount": remaining,
                "usage_percent": round(expense * 100 / amount, 1) if amount else None,
                "budget_status": status, "recent_transactions": self.ordered(items)[:5]}

    def transactions(self, uid, start, end, type_, category, limit, cursor):
        today = self.today()
        first, last = window(start, today, field="from"), window(end, today, field="to")
        if first > last or (last - first).days + 1 > 366:
            raise invalid("from", "Rentang maksimal 366 hari inklusif dan harus berurutan.")
        if category and category not in KINDS:
            raise invalid("category_code")
        if type_ and category and KINDS[category][0] != type_:
            raise invalid("category_code", "Kategori tidak cocok dengan jenis transaksi.")
        filters = {"uid": uid, "from": start, "to": end, "type": type_, "category_code": category}
        signature = hashlib.sha256(canonical(filters).encode()).hexdigest()
        after = None
        if cursor:
            try:
                if len(cursor) > 2048:
                    raise ValueError()
                data = strict_json(base64.b64decode(cursor + "=" * (-len(cursor) % 4), altchars=b"-_", validate=True))
                if set(data) != {"v", "filters", "last"} or data["v"] != 1 or data["filters"] != signature:
                    raise ValueError()
                if not isinstance(data["last"], list) or len(data["last"]) != 2:
                    raise ValueError()
                iso_date(data["last"][0])
                uuid_string(data["last"][1])
                after = tuple(data["last"])
            except (ValueError, TypeError, KeyError, UnicodeError) as exc:
                raise invalid("cursor", "Cursor tidak valid atau filter berubah.") from exc
        items = self.ordered([r for r in self.ledger.state().active(uid, "TRANSACTION")
                             if start <= r["transaction_date"] <= end
                             and (not type_ or r["type"] == type_)
                             and (not category or r["category_code"] == category)
                             and (not after or (r["transaction_date"], r["id"]) < after)])
        page = items[:limit]
        next_cursor = None
        if len(items) > limit:
            last_item = page[-1]
            value = {"v": 1, "filters": signature, "last": [last_item["transaction_date"], last_item["id"]]}
            next_cursor = base64.urlsafe_b64encode(canonical(value).encode()).decode().rstrip("=")
        return {"items": deepcopy(page), "next_cursor": next_cursor}

    def defaults(self, uid):
        return {"items": sorted(self.ledger.state().active(uid, "BUDGET_DEFAULT"), key=lambda r: r["effective_from"]),
                "next_cursor": None}

    def preferences(self, uid):
        item = self.ledger.state().get(uid, "PREFERENCES", "preferences")
        return public_resource(item) if item and not item.get("deleted") else deepcopy(DEFAULT_PREFERENCES)

    def monthly(self, uid, month):
        if not re.fullmatch(r"[0-9]{4}-[0-9]{2}", month):
            raise invalid("month", "Gunakan YYYY-MM.")
        try:
            first = date.fromisoformat(month + "-01")
        except ValueError as exc:
            raise invalid("month") from exc
        today = self.today()
        earliest = (today - timedelta(days=366)).replace(day=1)
        if not earliest <= first <= today.replace(day=1):
            raise invalid("month", "Bulan di luar rentang yang diizinkan.")
        items = [r for r in self.ledger.state().active(uid, "TRANSACTION") if r["transaction_date"].startswith(month)]
        income = sum(r["amount"] for r in items if r["type"] == "INCOME")
        expense = sum(r["amount"] for r in items if r["type"] == "EXPENSE")
        by_category = []
        for code, (kind, label) in KINDS.items():
            if kind == "EXPENSE":
                total = sum(r["amount"] for r in items if r["category_code"] == code)
                if total:
                    by_category.append({"category_code": code, "category_label": label, "amount": total})
        return {"month": month, "income_total": income, "expense_total": expense, "net_flow": income - expense,
                "expenses_by_category": sorted(by_category, key=lambda r: (-r["amount"], r["category_code"]))}
