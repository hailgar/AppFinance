import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException

from app.api.routes import router
from app.core.auth import FirebaseVerifier
from app.core.config import Settings
from app.core.errors import AppError, IntegrityError
from app.core.middleware import GatewayMiddleware
from app.repositories.checkpoint import Checkpoint, ProcessLease
from app.repositories.sheets import SheetsRepository
from app.schemas.responses import ErrorEnvelope
from app.services.domain import utc_now
from app.services.ledger import LedgerService
from app.services.projections import ProjectionManager


def create_app(settings=None, repository=None, verifier=None, clock=utc_now):
    config = settings or Settings()
    logging.basicConfig(level=config.log_level, format="%(levelname)s %(name)s %(message)s")
    for logger_name in ("httpx", "httpcore", "urllib3", "google.auth", "firebase_admin"):
        logging.getLogger(logger_name).setLevel(logging.WARNING)

    @asynccontextmanager
    async def lifespan(app):
        config.check_runtime()
        lease, repo, auth_verifier = None, None, None
        projection_stop, projection_task = asyncio.Event(), None
        try:
            if repository is None:
                lease = ProcessLease(config.ledger_checkpoint_path)
            repo = repository if repository is not None else await run_in_threadpool(
                SheetsRepository, config.google_sheets_spreadsheet_id, config.upstream_timeout_seconds,
                credentials_path=config.google_application_credentials)
            auth_verifier = verifier if verifier is not None else await run_in_threadpool(
                FirebaseVerifier, config.firebase_project_id, config.google_application_credentials)
            checkpoint = None if repository is not None else Checkpoint(config.ledger_checkpoint_path, config.google_sheets_spreadsheet_id)
            projection = ProjectionManager(repo, config.allowed_firebase_uid, config.projection_retry_seconds)
            app.state.ledger = LedgerService(repo, checkpoint, config.cache_ttl_seconds, clock, projection)
            app.state.verifier, app.state.config = auth_verifier, config
            await run_in_threadpool(app.state.ledger.state, True)

            async def projection_worker():
                while True:
                    try:
                        await asyncio.wait_for(projection_stop.wait(), timeout=config.projection_retry_seconds)
                        return
                    except TimeoutError:
                        pass
                    try:
                        await run_in_threadpool(app.state.ledger.refresh_projections)
                    except Exception as exc:
                        # A corrupt/unavailable source is never projected. Preserve
                        # the last report and retry; API reads still fail closed.
                        logging.getLogger(__name__).warning("projection_retry_source_unavailable type=%s", type(exc).__name__)

            projection_task = asyncio.create_task(projection_worker())
            yield
        finally:
            projection_stop.set()
            if projection_task:
                await projection_task
            if repo:
                await run_in_threadpool(repo.close)
            if auth_verifier and hasattr(auth_verifier, "close"):
                await run_in_threadpool(auth_verifier.close)
            if lease:
                lease.close()

    app = FastAPI(title="Catat Harian API", version="0.1.0", lifespan=lifespan,
                  description="Single worker/replica. Firebase ID token + UID allowlist. Mutasi wajib Idempotency-Key UUID.",
                  responses={code: {"model": ErrorEnvelope} for code in (401, 403, 404, 409, 422, 429, 503)})
    app.add_middleware(GatewayMiddleware, settings=config)
    if config.cors_origins:
        app.add_middleware(CORSMiddleware, allow_origins=config.cors_origins, allow_credentials=False,
                           allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
                           allow_headers=["Authorization", "Content-Type", "Idempotency-Key"], expose_headers=["X-Request-ID", "Retry-After"])

    def error_response(request, status, code, message, fields=None, headers=None):
        return JSONResponse(status_code=status, content={"error": {"code": code, "message": message,
            "fields": fields or {}}, "request_id": getattr(request.state, "request_id", "unavailable")}, headers=headers)

    @app.exception_handler(AppError)
    async def app_error(request: Request, exc: AppError):
        if isinstance(exc, IntegrityError):
            logging.getLogger(__name__).error("storage_integrity_error request_id=%s", request.state.request_id)
        return error_response(request, exc.status, exc.code, exc.message, exc.fields, exc.headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError):
        fields = {".".join(str(x) for x in e["loc"]): "Nilai tidak valid." for e in exc.errors()}
        return error_response(request, 422, "VALIDATION_ERROR", "Periksa data yang diisi.", fields)

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException):
        return error_response(request, exc.status_code, "NOT_FOUND" if exc.status_code == 404 else "HTTP_ERROR",
                              "Endpoint tidak ditemukan." if exc.status_code == 404 else "Request tidak dapat diproses.")

    @app.exception_handler(Exception)
    async def unexpected_error(request: Request, exc: Exception):
        # Do not log repr/traceback: upstream exceptions may contain tokens, URLs or request payloads.
        logging.getLogger(__name__).error("internal_error type=%s request_id=%s", type(exc).__name__,
                                         getattr(request.state, "request_id", "unavailable"))
        return error_response(request, 500, "INTERNAL_ERROR", "Terjadi kendala. Coba lagi.")

    app.include_router(router)
    return app
