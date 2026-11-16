from copy import deepcopy
from datetime import datetime, timezone
from uuid import uuid4

from app.services.ledger import LedgerService
from app.services.reducer import HEADERS

NOW = datetime(2026, 11, 16, 5, tzinfo=timezone.utc)


class MemoryRepository:
    """Test double only. There is deliberately no runtime in-memory backend option."""
    def __init__(self):
        self.rows = [HEADERS.copy()]
        self.after_append = None
        self.views = {}
        self.view_writes = 0

    def read_rows(self):
        return deepcopy(self.rows)

    def append(self, row):
        self.rows.append(deepcopy(row))
        if self.after_append:
            self.after_append()

    def close(self):
        pass

    def replace_views(self, tables):
        self.views.update(deepcopy(tables))
        self.view_writes += 1


def service(repository=None):
    return LedgerService(repository or MemoryRepository(), ttl=0, clock=lambda: NOW)


def transaction(**changes):
    return {"id": str(uuid4()), "type": "EXPENSE", "amount": 35000, "category_code": "EXP_FOOD",
            "transaction_date": "2026-11-16", **changes}
