import json
import logging
import os
import time
import uuid

from fastapi import Request


logger = logging.getLogger("retailos.ai_service")
logging.basicConfig(level=logging.INFO, format="%(message)s")

if os.getenv("LOG_TO_FILE", "").lower() == "true":
    log_dir = os.getenv("LOG_DIR", "logs")
    os.makedirs(log_dir, exist_ok=True)
    file_handler = logging.FileHandler(os.path.join(log_dir, "ai-service.log"), encoding="utf-8")
    file_handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(file_handler)


def log_event(event: str, **fields):
    logger.info(
        json.dumps(
            {
                "event": event,
                "service": "ai-service",
                "environment": os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "development")),
                **fields,
            },
            default=str,
        )
    )


async def request_logging_middleware(request: Request, call_next):
    request_id = (
        request.headers.get("x-correlation-id")
        or request.headers.get("x-request-id")
        or f"ai_{uuid.uuid4().hex}"
    )
    started = time.perf_counter()
    request.state.correlation_id = request_id

    try:
        response = await call_next(request)
    except Exception as error:
        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        log_event(
            "request_failed",
            correlationId=request_id,
            method=request.method,
            path=request.url.path,
            stage=stage_for_path(request.url.path),
            status="error",
            durationMs=duration_ms,
            latencyMs=duration_ms,
            error=str(error),
        )
        raise

    duration_ms = round((time.perf_counter() - started) * 1000, 2)
    response.headers["x-request-id"] = request_id
    response.headers["x-correlation-id"] = request_id
    log_event(
        "request_completed",
        correlationId=request_id,
        method=request.method,
        path=request.url.path,
        stage=stage_for_path(request.url.path),
        status=response.status_code,
        statusCode=response.status_code,
        durationMs=duration_ms,
        latencyMs=duration_ms,
    )
    return response


def stage_for_path(path: str) -> str:
    if path.startswith("/analyze-shelf") or path.startswith("/detect-yolo"):
        return "yolo"
    if path.startswith("/rag/index-report"):
        return "embedding"
    if path.startswith("/assistant/query"):
        return "assistant"
    if path.startswith("/metrics"):
        return "metrics"
    return "request"
