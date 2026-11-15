from app.repositories.sheets import VIEW_HEADERS
from app.schemas.commands import KINDS


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
    repository.replace_views({"Metadata": metadata(at, state.rows_processed, "BUILDING")})
    try:
        repository.replace_views(projection_tables(state, uid, at))
    except Exception:
        try:
            repository.replace_views({"Metadata": metadata(at, state.rows_processed, "FAILED_RETRY_REQUIRED")})
        except Exception:
            pass  # A source receipt remains valid even if Metadata itself is unreachable.
        raise
