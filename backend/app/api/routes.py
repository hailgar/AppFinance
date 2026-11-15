from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel

from app.core.errors import AppError
from app.schemas.commands import (
    BudgetPut, DateString, DeleteCommand, KINDS, PreferencesPut, Reminder,
    QueryInteger, TransactionCreate, TransactionPatch, TransactionType, UUIDString,
)
from app.schemas.responses import (
    BudgetDefault, Category, DailyBudget, Dashboard, Deleted, EffectiveBudget, Envelope,
    Me, MonthlySummary, Operation, Page, StorageStatus, Transaction, UnknownOperation,
)
from app.services.queries import Queries

router = APIRouter(prefix="/api/v1")
bearer = HTTPBearer(auto_error=False, scheme_name="FirebaseIDToken", description="Firebase ID token dari Android Google Sign-In.")


def identity(request: Request, credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)]):
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise AppError(401, "UNAUTHENTICATED", "Silakan masuk terlebih dahulu.", headers={"WWW-Authenticate": "Bearer"})
    claims = request.app.state.verifier.verify(credentials.credentials)
    if claims.get("uid") != request.app.state.config.allowed_firebase_uid:
        raise AppError(403, "FORBIDDEN", "Akun ini tidak diizinkan.")
    return claims


Identity = Annotated[dict, Depends(identity)]
IdempotencyKey = Annotated[UUIDString, Header(alias="Idempotency-Key")]
ExpectedQuery = Annotated[QueryInteger, Query(ge=0, alias="expected_revision")]


def reply(request, data, status=200):
    return JSONResponse(status_code=status, content={"data": data, "request_id": request.state.request_id})


def mutate(request, claims, key, kind, entity_id, action, expected, body):
    status, data = request.app.state.ledger.mutate(claims["uid"], key, kind, entity_id, action, expected, body)
    return reply(request, data, status)


UNKNOWN_RESPONSE = {202: {"model": Envelope[UnknownOperation], "description": "Hasil write belum pasti; periksa operation lalu retry key/body yang sama."}}


@router.get("/health/live", tags=["Health"])
def live(request: Request):
    return reply(request, {"status": "ok"})


@router.get("/me", response_model=Envelope[Me], tags=["Account"])
def me(request: Request, claims: Identity):
    return reply(request, {"uid": claims["uid"], "display_name": claims.get("name"), "currency": "IDR", "timezone": "Asia/Jakarta"})


@router.get("/storage/status", response_model=Envelope[StorageStatus], tags=["Operations"])
def storage_status(request: Request, claims: Identity):
    return reply(request, request.app.state.ledger.storage_status())


@router.get("/categories", response_model=Envelope[Page[Category]], tags=["Transactions"])
def categories(request: Request, claims: Identity, type: TransactionType | None = None):
    return reply(request, {"items": [{"code": code, "label": label, "type": kind} for code, (kind, label) in KINDS.items()
                                     if type is None or type == kind], "next_cursor": None})


@router.get("/dashboard", response_model=Envelope[Dashboard], tags=["Summary"])
def dashboard(request: Request, claims: Identity, date: DateString):
    return reply(request, Queries(request.app.state.ledger).dashboard(claims["uid"], date))


@router.get("/transactions", response_model=Envelope[Page[Transaction]], tags=["Transactions"])
def list_transactions(request: Request, claims: Identity, start: Annotated[DateString, Query(alias="from")],
                      end: Annotated[DateString, Query(alias="to")], type: TransactionType | None = None,
                      category_code: str | None = None, cursor: str | None = None,
                      limit: Annotated[QueryInteger, Query(ge=1, le=100)] = 20):
    result = Queries(request.app.state.ledger).transactions(claims["uid"], start, end, type, category_code, limit, cursor)
    return reply(request, result)


@router.post("/transactions", status_code=201, response_model=Envelope[Transaction],
             responses={200: {"model": Envelope[Transaction], "description": "Replay"}, **UNKNOWN_RESPONSE}, tags=["Transactions"])
def create_transaction(request: Request, claims: Identity, key: IdempotencyKey, body: TransactionCreate):
    return mutate(request, claims, key, "TRANSACTION", body.id, "CREATE", 0, body)


@router.get("/transactions/{id}", response_model=Envelope[Transaction], tags=["Transactions"])
def get_transaction(request: Request, claims: Identity, id: UUIDString):
    return reply(request, Queries(request.app.state.ledger).get_transaction(claims["uid"], id))


@router.patch("/transactions/{id}", response_model=Envelope[Transaction], responses=UNKNOWN_RESPONSE, tags=["Transactions"])
def patch_transaction(request: Request, claims: Identity, id: UUIDString, key: IdempotencyKey, body: TransactionPatch):
    return mutate(request, claims, key, "TRANSACTION", id, "UPDATE", body.expected_revision, body)


@router.delete("/transactions/{id}", response_model=Envelope[Deleted], responses=UNKNOWN_RESPONSE, tags=["Transactions"])
def delete_transaction(request: Request, claims: Identity, id: UUIDString, key: IdempotencyKey, expected_revision: ExpectedQuery):
    return mutate(request, claims, key, "TRANSACTION", id, "DELETE", expected_revision, DeleteCommand(expected_revision=expected_revision))


@router.get("/budgets/effective", response_model=Envelope[EffectiveBudget], tags=["Budget"])
def effective_budget(request: Request, claims: Identity, date: DateString):
    return reply(request, Queries(request.app.state.ledger).effective(claims["uid"], date))


@router.get("/budgets/defaults", response_model=Envelope[Page[BudgetDefault]], tags=["Budget"])
def list_defaults(request: Request, claims: Identity):
    return reply(request, Queries(request.app.state.ledger).defaults(claims["uid"]))


@router.put("/budgets/defaults/{effective_from}", response_model=Envelope[BudgetDefault], responses=UNKNOWN_RESPONSE, tags=["Budget"])
def put_default(request: Request, claims: Identity, effective_from: DateString, key: IdempotencyKey, body: BudgetPut):
    return mutate(request, claims, key, "BUDGET_DEFAULT", effective_from, "UPSERT", body.expected_revision, body)


@router.put("/budgets/daily/{date}", response_model=Envelope[DailyBudget], responses=UNKNOWN_RESPONSE, tags=["Budget"])
def put_daily(request: Request, claims: Identity, date: DateString, key: IdempotencyKey, body: BudgetPut):
    return mutate(request, claims, key, "DAILY_BUDGET", date, "UPSERT", body.expected_revision, body)


@router.delete("/budgets/daily/{date}", response_model=Envelope[Deleted], responses=UNKNOWN_RESPONSE, tags=["Budget"])
def delete_daily(request: Request, claims: Identity, date: DateString, key: IdempotencyKey, expected_revision: ExpectedQuery):
    return mutate(request, claims, key, "DAILY_BUDGET", date, "DELETE", expected_revision, DeleteCommand(expected_revision=expected_revision))


@router.get("/summary/monthly", response_model=Envelope[MonthlySummary], tags=["Summary"])
def monthly(request: Request, claims: Identity, month: str):
    return reply(request, Queries(request.app.state.ledger).monthly(claims["uid"], month))


class PreferencesResponse(BaseModel):
    budget_reminder: Reminder
    record_reminder: Reminder
    revision: int


@router.get("/preferences", response_model=Envelope[PreferencesResponse], tags=["Preferences"])
def preferences(request: Request, claims: Identity):
    return reply(request, Queries(request.app.state.ledger).preferences(claims["uid"]))


@router.put("/preferences", response_model=Envelope[PreferencesResponse], responses=UNKNOWN_RESPONSE, tags=["Preferences"])
def put_preferences(request: Request, claims: Identity, key: IdempotencyKey, body: PreferencesPut):
    return mutate(request, claims, key, "PREFERENCES", "preferences", "UPSERT", body.expected_revision, body)


@router.get("/operations/{key}", response_model=Envelope[Operation], responses=UNKNOWN_RESPONSE, tags=["Operations"])
def get_operation(request: Request, claims: Identity, key: UUIDString):
    status, result = request.app.state.ledger.operation(claims["uid"], key)
    return reply(request, result, status)
