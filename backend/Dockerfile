FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    APP_ENV=production \
    WEB_CONCURRENCY=1 \
    UVICORN_WORKERS=1 \
    LEDGER_CHECKPOINT_PATH=/app/data/ledger-checkpoint.json

WORKDIR /app
COPY requirements.lock ./requirements.lock
RUN python -m pip install --no-cache-dir -r requirements.lock \
    && groupadd --gid 10001 catat \
    && useradd --uid 10001 --gid catat --no-create-home catat \
    && mkdir -p /app/data \
    && chown catat:catat /app/data

COPY --chown=catat:catat app ./app
COPY --chown=catat:catat scripts ./scripts
USER 10001:10001
EXPOSE 8000
VOLUME ["/app/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health/live', timeout=3)" || exit 1
CMD ["python", "-m", "uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--no-access-log", "--no-proxy-headers"]
