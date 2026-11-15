import json
import logging
import time
from collections import OrderedDict, deque
from uuid import uuid4

log = logging.getLogger(__name__)


class GatewayMiddleware:
    """Bound body size even without Content-Length, and cap per-IP window memory."""
    def __init__(self, app, settings):
        self.app, self.settings = app, settings
        self.windows = OrderedDict()

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        start = time.monotonic()
        request_id = str(uuid4())
        scope.setdefault("state", {})["request_id"] = request_id

        async def reject(status, code, message, retry=False):
            headers = [(b"content-type", b"application/json"), (b"x-request-id", request_id.encode())]
            if retry:
                headers.append((b"retry-after", b"60"))
            await send({"type": "http.response.start", "status": status, "headers": headers})
            await send({"type": "http.response.body", "body": json.dumps({"error": {"code": code,
                "message": message, "fields": {}}, "request_id": request_id}).encode()})

        if scope["path"] != "/api/v1/health/live":
            ip = (scope.get("client") or ("unknown",))[0]
            if ip not in self.windows:
                if len(self.windows) >= 2048:
                    self.windows.popitem(last=False)
                self.windows[ip] = deque()
            samples = self.windows[ip]
            self.windows.move_to_end(ip)
            while samples and samples[0] <= start - 60:
                samples.popleft()
            if len(samples) >= self.settings.rate_limit_per_minute:
                return await reject(429, "RATE_LIMITED", "Terlalu banyak permintaan. Coba sebentar lagi.", True)
            samples.append(start)
        headers = dict(scope["headers"])
        try:
            length = int(headers.get(b"content-length", b"0"))
        except ValueError:
            return await reject(400, "BAD_REQUEST", "Request tidak valid.")
        if length < 0:
            return await reject(400, "BAD_REQUEST", "Request tidak valid.")
        if length > self.settings.max_body_bytes:
            return await reject(413, "PAYLOAD_TOO_LARGE", "Request terlalu besar.")
        chunks, total = [], 0
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            chunk = message.get("body", b"")
            chunks.append(chunk)
            total += len(chunk)
            if total > self.settings.max_body_bytes:
                return await reject(413, "PAYLOAD_TOO_LARGE", "Request terlalu besar.")
            if not message.get("more_body", False):
                break
        body = b"".join(chunks)
        if scope["method"] == "DELETE" and body:
            return await reject(422, "VALIDATION_ERROR", "DELETE memakai query expected_revision dan body kosong.")
        delivered = False
        response_started = False
        response_finished = False

        async def replay_receive():
            nonlocal delivered
            if not delivered:
                delivered = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        async def wrapped_send(message):
            nonlocal response_started, response_finished
            if message["type"] == "http.response.start":
                response_started = True
                message["headers"] = list(message.get("headers", [])) + [(b"x-request-id", request_id.encode())]
                route = scope.get("route")
                # Route template only, no URL query, token, UID, amount, note or resource identifier.
                log.info("request request_id=%s route=%s status=%s duration_ms=%.1f", request_id,
                         getattr(route, "path", "unmatched"), message["status"], (time.monotonic() - start) * 1000)
            if message["type"] == "http.response.body" and not message.get("more_body", False):
                response_finished = True
            await send(message)
        try:
            await self.app(scope, replay_receive, wrapped_send)
        except Exception as exc:
            # Starlette's outer error middleware re-raises unhandled exceptions to the server.
            # Handle them here to avoid upstream exception text/payload appearing in uvicorn logs.
            log.error("internal_error type=%s request_id=%s", type(exc).__name__, request_id)
            if not response_started:
                await reject(500, "INTERNAL_ERROR", "Terjadi kendala. Coba lagi.")
            elif not response_finished:
                await send({"type": "http.response.body", "body": b"", "more_body": False})
