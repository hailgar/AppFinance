from typing import Any, Generic, Literal, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Envelope(BaseModel, Generic[T]):
    data: T
    request_id: str


class ErrorDetail(BaseModel):
    code: str
    message: str
    fields: dict[str, Any]


class ErrorEnvelope(BaseModel):
    error: ErrorDetail
    request_id: str


class Audit(BaseModel):
    revision: int
    created_at: str
    updated_at: str


class Transaction(Audit):
    id: str
    type: Literal["EXPENSE", "INCOME"]
    amount: int
    category_code: str
    transaction_date: str
    note: str | None


class Page(BaseModel, Generic[T]):
    items: list[T]
    next_cursor: str | None


class Deleted(BaseModel):
    id: str
    deleted: Literal[True]
    revision: int


class BudgetDefault(Audit):
    effective_from: str
    amount: int


class DailyBudget(Audit):
    date: str
    amount: int


class EffectiveBudget(BaseModel):
    amount: int | None
    source: Literal["OVERRIDE", "DEFAULT", "UNSET"]
    effective_from: str | None
    override_active: bool
    override_revision: int


class Dashboard(BaseModel):
    date: str
    timezone: str
    budget_amount: int | None
    budget_source: str
    expense_total: int
    income_total: int
    remaining_amount: int | None
    usage_percent: float | None
    budget_status: Literal["UNSET", "WITHIN_BUDGET", "AT_LIMIT", "OVER_BUDGET"]
    recent_transactions: list[Transaction]


class CategoryTotal(BaseModel):
    category_code: str
    category_label: str
    amount: int


class MonthlySummary(BaseModel):
    month: str
    income_total: int
    expense_total: int
    net_flow: int
    expenses_by_category: list[CategoryTotal]


class UnknownOperation(BaseModel):
    operation_id: str
    status: Literal["UNKNOWN"]


class Operation(BaseModel):
    operation_id: str
    status: Literal["APPLIED", "CONFLICT"]
    http_status: int
    data: dict[str, Any] | None = None
    error: ErrorDetail | None = None


class Me(BaseModel):
    uid: str
    display_name: str | None
    currency: Literal["IDR"]
    timezone: Literal["Asia/Jakarta"]


class Category(BaseModel):
    code: str
    label: str
    type: Literal["EXPENSE", "INCOME"]


class StorageStatus(BaseModel):
    status: Literal["PENDING", "OK", "FAILED_RETRY_REQUIRED", "DISABLED"]
    source_rows_processed: int
    projected_rows_processed: int | None
    projection_built_at: str | None
    last_error_code: str | None
    retry_after_seconds: float
