import re
from datetime import date
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, BeforeValidator, BaseModel, ConfigDict, Field, StrictBool, StrictInt, StrictStr, model_validator

MAX_AMOUNT = 999_999_999_999
KINDS = {
    "EXP_FOOD": ("EXPENSE", "Makan & Minum"),
    "EXP_TRANSPORT": ("EXPENSE", "Transportasi"),
    "EXP_SHOPPING": ("EXPENSE", "Belanja"),
    "EXP_BILLS": ("EXPENSE", "Tagihan"),
    "EXP_ENTERTAINMENT": ("EXPENSE", "Hiburan"),
    "EXP_OTHER": ("EXPENSE", "Lainnya"),
    "INC_SALARY": ("INCOME", "Gaji"),
    "INC_BONUS": ("INCOME", "Bonus"),
    "INC_OTHER": ("INCOME", "Lainnya"),
}


def iso_date(value):
    if not re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}", value):
        raise ValueError("Gunakan YYYY-MM-DD.")
    date.fromisoformat(value)
    return value


def uuid_string(value):
    return str(UUID(value))


def category(value):
    if value not in KINDS:
        raise ValueError("Kategori tidak dikenal.")
    return value


def query_integer(value):
    if type(value) is int:  # FastAPI validates the integer default as well as URL input.
        return value
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]+", value):
        raise ValueError("Gunakan integer.")
    return int(value)


DateString = Annotated[StrictStr, AfterValidator(iso_date)]
UUIDString = Annotated[StrictStr, AfterValidator(uuid_string)]
Category = Annotated[StrictStr, AfterValidator(category)]
Amount = Annotated[StrictInt, Field(ge=1, le=MAX_AMOUNT)]
BudgetAmount = Annotated[StrictInt, Field(ge=0, le=MAX_AMOUNT)]
Revision = Annotated[StrictInt, Field(ge=0)]
TransactionType = Literal["EXPENSE", "INCOME"]
Note = Annotated[StrictStr, Field(max_length=200)]
TimeString = Annotated[StrictStr, Field(pattern=r"^([01][0-9]|2[0-3]):[0-5][0-9]$")]
QueryInteger = Annotated[int, BeforeValidator(query_integer)]


class Command(BaseModel):
    model_config = ConfigDict(extra="forbid")


class TransactionCreate(Command):
    id: UUIDString
    type: TransactionType
    amount: Amount
    category_code: Category
    transaction_date: DateString
    note: Note | None = None

    @model_validator(mode="after")
    def matching_category(self):
        if KINDS[self.category_code][0] != self.type:
            raise ValueError("Kategori tidak cocok dengan jenis transaksi.")
        return self


class TransactionPatch(Command):
    expected_revision: Revision
    type: TransactionType | None = None
    amount: Amount | None = None
    category_code: Category | None = None
    transaction_date: DateString | None = None
    note: Note | None = None

    @model_validator(mode="after")
    def valid_patch(self):
        changed = self.model_fields_set - {"expected_revision"}
        if not changed:
            raise ValueError("Kirim minimal satu perubahan.")
        if any(getattr(self, name) is None for name in changed - {"note"}):
            raise ValueError("Hanya catatan yang boleh null.")
        return self


class BudgetPut(Command):
    amount: BudgetAmount
    expected_revision: Revision


class Reminder(Command):
    enabled: StrictBool
    time: TimeString


class PreferencesPut(Command):
    budget_reminder: Reminder
    record_reminder: Reminder
    expected_revision: Revision


class DeleteCommand(Command):
    expected_revision: Revision
