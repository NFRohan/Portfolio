import time
from contextlib import contextmanager
from typing import Iterator

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Histogram, generate_latest

from . import config
from .logging_utils import log_event

try:
    import sentry_sdk
    from sentry_sdk.integrations.fastapi import FastApiIntegration
    from sentry_sdk.integrations.openai import OpenAIIntegration
except Exception:  # pragma: no cover - optional dependency guard
    sentry_sdk = None
    FastApiIntegration = None
    OpenAIIntegration = None


request_latency = Histogram(
    "retailos_ai_request_latency_ms",
    "AI service request latency in milliseconds.",
    ["stage", "status"],
    buckets=(50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000),
)
yolo_latency = Histogram(
    "retailos_ai_yolo_latency_ms",
    "YOLO analysis latency in milliseconds.",
    ["inference_type", "status"],
    buckets=(50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000),
)
openai_latency = Histogram(
    "retailos_ai_openai_latency_ms",
    "OpenAI call latency in milliseconds.",
    ["operation", "model", "status"],
    buckets=(100, 250, 500, 1000, 2500, 5000, 10000, 30000),
)
pinecone_latency = Histogram(
    "retailos_ai_pinecone_latency_ms",
    "Pinecone request latency in milliseconds.",
    ["operation", "status"],
    buckets=(50, 100, 250, 500, 1000, 2500, 5000, 10000),
)
assistant_latency = Histogram(
    "retailos_ai_assistant_latency_ms",
    "Assistant query latency in milliseconds.",
    ["retrieval_mode", "status"],
    buckets=(100, 250, 500, 1000, 2500, 5000, 10000, 30000),
)
errors_total = Counter(
    "retailos_ai_errors_total",
    "AI service errors by stage.",
    ["stage"],
)


def init_sentry() -> None:
    if not sentry_sdk or not config.SENTRY_DSN:
        return

    integrations = []
    if FastApiIntegration:
        integrations.append(FastApiIntegration())
    if OpenAIIntegration:
        integrations.append(OpenAIIntegration(include_prompts=False))

    sentry_sdk.init(
        dsn=config.SENTRY_DSN,
        environment=config.APP_ENV,
        release=config.SENTRY_RELEASE or None,
        traces_sample_rate=config.SENTRY_TRACES_SAMPLE_RATE,
        send_default_pii=False,
        integrations=integrations,
    )
    sentry_sdk.set_tag("service", "ai-service")


def capture_exception(
    error: Exception,
    *,
    stage: str,
    visit_id: str | None = None,
    model: str | None = None,
    inference_type: str | None = None,
    correlation_id: str | None = None,
    extra: dict | None = None,
) -> None:
    errors_total.labels(stage).inc()
    if not sentry_sdk:
        return
    with sentry_sdk.push_scope() as scope:
        scope.set_tag("service", "ai-service")
        scope.set_tag("stage", stage)
        if visit_id:
            scope.set_tag("visit_id", visit_id)
        if model:
            scope.set_tag("model", model)
        if inference_type:
            scope.set_tag("inference_type", inference_type)
        if correlation_id:
            scope.set_tag("correlation_id", correlation_id)
        if extra:
            scope.set_context("retailos", extra)
        sentry_sdk.capture_exception(error)


@contextmanager
def observe_latency(metric: Histogram, labels: tuple[str, ...], event: str, **fields) -> Iterator[None]:
    started = time.perf_counter()
    status = "success"
    try:
        yield
    except Exception:
        status = "error"
        raise
    finally:
        latency_ms = round((time.perf_counter() - started) * 1000, 2)
        metric.labels(*labels, status).observe(latency_ms)
        log_event(event, **fields, latencyMs=latency_ms, status=status)


def metrics_response() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
