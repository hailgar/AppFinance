import logging
import time

from app.core.errors import AppError
from app.repositories.sheets import VIEW_HEADERS
from app.schemas.commands import KINDS

log = logging.getLogger(__name__)


def metadata(at, rows, status):
    return [VIEW_HEADERS["Metadata"], [1, at, rows, status]]


def projection_tables(state, uid, at):
    transactions = [VIEW_HEADERS["TransactionsView"]]
    for item in sorted(state.active(uid, "TRANSACTION"), key=lambda r: (r["transaction_date"], r["id"]), reverse=True):
        transactions.append([item["id"], item["transaction_date"], item["type"], item["amount"],
                             KINDS[item["category_code"]][1], item["note"], item["revision"], item["updated_at"]])
    budgets = [VIEW_HEADERS["BudgetsView"]]
    for kind, field in (("BUDGET_DEFAULT", "effective_from"), ("DAILY_BUDGET", "date")):
        for item in sorted(state.active(uid, kind), key=lambda r: r[field]):
            budgets.append([kind, item[field], item["amount"], item["revision"], item["updated_at"]])
    preferences = [VIEW_HEADERS["PreferencesView"]]
    item = state.get(uid, "PREFERENCES", "preferences")
    if item and not item.get("deleted"):
        for key in ("budget_reminder", "record_reminder"):
            preferences.append([key, item[key]["enabled"], item[key]["time"], item["revision"]])
    return {"TransactionsView": transactions, "BudgetsView": budgets, "PreferencesView": preferences,
            "Metadata": metadata(at, state.rows_processed, "OK")}


def rebuild(repository, state, uid, at):
    try:
        repository.replace_views({"Metadata": metadata(at, state.rows_processed, "BUILDING")})
        repository.replace_views(projection_tables(state, uid, at))
    except Exception:
        try:
            repository.replace_views({"Metadata": metadata(at, state.rows_processed, "FAILED_RETRY_REQUIRED")})
        except Exception:
            pass  # A source receipt remains valid even if Metadata itself is unreachable.
        raise


class ProjectionManager:
    """Derived reports never determine whether an append command was applied.

    Call under LedgerService.lock, shared with the foreground writer. Failed writes
    are retried by the lifespan worker; no transaction is appended to repair a view.
    """
    def __init__(self, repository, uid, retry_seconds=30, monotonic=time.monotonic):
        self.repository, self.uid = repository, uid
        self.retry_seconds, self.monotonic = retry_seconds, monotonic
        self.source_rows = 0
        self.projected_rows = None
        self.last_built_at = None
        self.last_error_code = None
        self.next_retry_at = 0

    def sync(self, state, at):
        self.source_rows = state.rows_processed
        if self.projected_rows == self.source_rows or self.monotonic() < self.next_retry_at:
            return
        try:
            rebuild(self.repository, state, self.uid, at)
        except Exception as exc:
            # Upstream exception text can contain requests/private values. Log only
            # the controlled code and never propagate a projection failure as a
            # failed financial mutation after the source receipt is confirmed.
            self.last_error_code = exc.code if isinstance(exc, AppError) else "PROJECTION_ERROR"
            self.next_retry_at = self.monotonic() + self.retry_seconds
            log.warning("projection_refresh_failed code=%s source_rows=%d", self.last_error_code, self.source_rows)
            return
        self.projected_rows = state.rows_processed
        self.last_built_at = at
        self.last_error_code = None
        self.next_retry_at = 0

    def status(self):
        return {
            "status": "OK" if self.projected_rows == self.source_rows else
                      "FAILED_RETRY_REQUIRED" if self.last_error_code else "PENDING",
            "source_rows_processed": self.source_rows,
            "projected_rows_processed": self.projected_rows,
            "projection_built_at": self.last_built_at,
            "last_error_code": self.last_error_code,
            "retry_after_seconds": max(0, round(self.next_retry_at - self.monotonic(), 1)),
        }
