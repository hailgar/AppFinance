import logging
import time
from threading import RLock

from pydantic import ValidationError

from app.core.errors import AppError, StorageUnavailable, WriteUnknown
from app.services.domain import candidate, normalize, semantic_hash, stamp, utc_now
from app.services.reducer import make_event, replay

log = logging.getLogger(__name__)


class LedgerService:
    def __init__(self, repository, checkpoint=None, ttl=2, clock=utc_now):
        self.repository, self.checkpoint, self.ttl, self.clock = repository, checkpoint, ttl, clock
        self.lock = RLock()
        self._state = None
        self._loaded_at = 0

    def state(self, force=False):
        with self.lock:
            if not force and self._state is not None and time.monotonic() - self._loaded_at < self.ttl:
                return self._state
            # Invalidate before reading: a failed integrity check must never leave a usable stale cache.
            self._state = None
            started = time.monotonic()
            rows = self.repository.read_rows()
            if self.checkpoint:
                self.checkpoint.verify(rows)
            state = replay(rows)
            if self.checkpoint:
                self.checkpoint.save(rows)
            self._state, self._loaded_at = state, time.monotonic()
            log.info("ledger_replay rows=%d duration_ms=%.1f", state.rows_processed, (time.monotonic() - started) * 1000)
            return state

    def mutate(self, uid, key, kind, entity_id, action, expected, model):
        command = normalize(model)
        hash_ = semantic_hash(uid, kind, entity_id, action, expected, command)
        with self.lock:
            state = self.state(force=True)
            prior = state.receipts.get((uid, key))
            if prior:
                if prior["semantic_hash"] != hash_:
                    raise AppError(409, "IDEMPOTENCY_KEY_CONFLICT", "Key sudah dipakai untuk aksi berbeda.")
                return self.receipt_response(prior, replayed=True)
            at = stamp(self.clock())
            try:
                payload = candidate(kind, entity_id, action, command, state.get(uid, kind, entity_id), expected, at)
            except ValidationError as exc:
                raise AppError(422, "VALIDATION_ERROR", "Periksa data yang diisi.",
                               {"category_code": "Kategori harus sesuai dengan jenis transaksi akhir."}) from exc
            event = make_event(uid, key, kind, entity_id, action, expected, command, payload, at)
            self._state = None
            try:
                self.repository.append(event)
            except WriteUnknown:
                log.warning("ledger_append_unknown")
                return 202, {"operation_id": key, "status": "UNKNOWN"}
            try:
                receipt = self.state(force=True).receipts.get((uid, key))
            except StorageUnavailable:
                return 202, {"operation_id": key, "status": "UNKNOWN"}
            if not receipt:
                return 202, {"operation_id": key, "status": "UNKNOWN"}
            return self.receipt_response(receipt)

    @staticmethod
    def receipt_response(receipt, replayed=False):
        if receipt["status"] == "CONFLICT":
            error = receipt["error"]
            raise AppError(409, error["code"], error["message"], error["fields"])
        return (200 if replayed else receipt["http_status"]), receipt["data"]

    def operation(self, uid, key):
        try:
            receipt = self.state(force=True).receipts.get((uid, key))
        except StorageUnavailable:
            return 202, {"operation_id": key, "status": "UNKNOWN"}
        if receipt is None:
            return 202, {"operation_id": key, "status": "UNKNOWN"}
        return 200, {k: v for k, v in receipt.items() if k != "semantic_hash"}
