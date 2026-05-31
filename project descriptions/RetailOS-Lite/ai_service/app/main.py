import hmac
import time

from fastapi import FastAPI, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.responses import Response as FastApiResponse
from fastapi.staticfiles import StaticFiles
from redis.asyncio import Redis

from . import config
from .compliance import build_supervisor_summary, evaluate_compliance
from .image_io import download_image, ensure_image_path, save_upload
from .llm_analysis import analyze_retail_image
from .logging_utils import log_event, request_logging_middleware
from .observability import capture_exception, init_sentry, metrics_response, observe_latency, yolo_latency
from .rag import RagConfigurationError, index_visit_report, query_assistant
from .schemas import (
    AssistantQueryRequest,
    AssistantQueryResponse,
    HealthResponse,
    ReadyResponse,
    ShelfAnalysisResponse,
    VisitReportIndexRequest,
    VisitReportIndexResponse,
    YoloDetectRequest,
    YoloResponse,
)
from .yolo_backend import RemoteYoloError, run_yolo_analysis
from .yolo_detector import get_detector, model_loaded


init_sentry()

app = FastAPI(
    title="RetailOS Lite AI Service",
    description="YOLO shelf detection and AI analysis service for RetailOS Lite.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.middleware("http")(request_logging_middleware)

PROTECTED_AI_PATHS = {
    "/analyze-shelf",
    "/detect-yolo",
    "/detect-yolo/upload",
    "/rag/index-report",
    "/assistant/query",
}

_rate_limit_redis: Redis | None = None


@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    if should_require_api_key(request):
        provided_key = request.headers.get("x-api-key", "")
        if not hmac.compare_digest(provided_key, config.AI_SERVICE_API_KEY):
            log_event("ai_service_auth_failed", path=request.url.path, method=request.method)
            return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    return await call_next(request)


@app.middleware("http")
async def protected_endpoint_rate_limit_middleware(request: Request, call_next):
    if should_rate_limit(request):
        try:
            allowed, retry_after = await consume_rate_limit(request)
        except Exception as error:
            log_event(
                "ai_service_rate_limit_unavailable",
                path=request.url.path,
                method=request.method,
                error=str(error),
            )
            if config.AI_SERVICE_RATE_LIMIT_FAIL_OPEN:
                return await call_next(request)
            return JSONResponse(
                {"detail": "Rate limiter unavailable. Please retry shortly."},
                status_code=503,
                headers={"Retry-After": "5"},
            )
        if not allowed:
            log_event(
                "ai_service_rate_limited",
                path=request.url.path,
                method=request.method,
                retryAfterSeconds=retry_after,
            )
            return JSONResponse(
                {"detail": "Too many requests. Please retry shortly.", "retryAfterSeconds": retry_after},
                status_code=429,
                headers={"Retry-After": str(retry_after)},
            )
    return await call_next(request)

config.UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
config.OVERLAY_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/artifacts/overlays", StaticFiles(directory=str(config.OVERLAY_DIR)), name="overlays")


def should_require_api_key(request: Request) -> bool:
    return (
        (bool(config.AI_SERVICE_API_KEY) or config.requires_ai_service_api_key())
        and request.method != "OPTIONS"
        and request.url.path in PROTECTED_AI_PATHS
    )


def should_rate_limit(request: Request) -> bool:
    return (
        config.AI_SERVICE_RATE_LIMIT_ENABLED
        and request.method != "OPTIONS"
        and request.url.path in PROTECTED_AI_PATHS
        and config.AI_SERVICE_RATE_LIMIT_PER_MINUTE > 0
    )


async def consume_rate_limit(request: Request) -> tuple[bool, int]:
    identity = request.headers.get("x-forwarded-for", "").split(",")[0].strip() or (
        request.client.host if request.client else "local"
    )
    key = f"rate-limit:ai-service:{request.url.path}:{identity}"
    redis = get_rate_limit_redis()
    count = await redis.incr(key)
    if count == 1:
        await redis.pexpire(key, 60_000)
    ttl_ms = await redis.pttl(key)
    retry_after = max(1, int((ttl_ms if ttl_ms > 0 else 60_000) / 1000))
    return count <= config.AI_SERVICE_RATE_LIMIT_PER_MINUTE, retry_after


def get_rate_limit_redis() -> Redis:
    global _rate_limit_redis
    if _rate_limit_redis is None:
        _rate_limit_redis = Redis.from_url(
            config.AI_SERVICE_RATE_LIMIT_REDIS_URL,
            socket_connect_timeout=1,
            socket_timeout=1,
            decode_responses=True,
        )
    return _rate_limit_redis


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        modelLoaded=model_loaded(),
        modelPath=str(config.MODEL_PATH),
    )


@app.get("/ready", response_model=ReadyResponse)
def ready(response: Response) -> ReadyResponse:
    errors = config.readiness_errors()
    if errors:
        response.status_code = 503
    return ReadyResponse(
        status="ready" if not errors else "not_ready",
        yoloBackend=config.YOLO_BACKEND,
        errors=errors,
    )


@app.get("/model")
def model_info():
    detector = get_detector() if config.YOLO_BACKEND == "local" else None
    return {
        "modelName": config.MODEL_NAME,
        "modelVersion": config.MODEL_VERSION,
        "modelPath": str(config.MODEL_PATH),
        "yoloBackend": config.YOLO_BACKEND,
        "modalConfigured": bool(config.MODAL_YOLO_URL),
        "defaultConfidence": config.DEFAULT_CONFIDENCE,
        "defaultImageSize": config.DEFAULT_IMAGE_SIZE,
        "classNames": detector.names if detector else {0: "foodie_noodles_olympics", 1: "mr_noodles_competitor"},
    }


@app.get("/metrics")
def prometheus_metrics():
    content, content_type = metrics_response()
    return FastApiResponse(content=content, media_type=content_type)


@app.post("/detect-yolo", response_model=YoloResponse)
def detect_yolo(payload: YoloDetectRequest) -> YoloResponse:
    try:
        image_path = resolve_request_image(payload)

        with observe_latency(
            yolo_latency,
            (config.YOLO_BACKEND,),
            "yolo_detection_completed",
            visitId=payload.visit_id,
            stage="yolo",
            inferenceType=config.YOLO_BACKEND,
            model=config.MODEL_NAME,
        ):
            return run_yolo_analysis(image_path=image_path, payload=payload)
    except (FileNotFoundError, ValueError) as error:
        capture_exception(error, stage="yolo", visit_id=payload.visit_id, model=config.MODEL_NAME, inference_type=config.YOLO_BACKEND)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RemoteYoloError as error:
        capture_exception(error, stage="yolo", visit_id=payload.visit_id, model=config.MODEL_NAME, inference_type=config.YOLO_BACKEND)
        raise HTTPException(status_code=502, detail=str(error)) from error


@app.post("/analyze-shelf", response_model=ShelfAnalysisResponse)
def analyze_shelf(payload: YoloDetectRequest) -> ShelfAnalysisResponse:
    warnings: list[str] = []
    try:
        image_path = resolve_request_image(payload)
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error

    try:
        with observe_latency(
            yolo_latency,
            (config.YOLO_BACKEND,),
            "yolo_detection_completed",
            visitId=payload.visit_id,
            stage="yolo",
            inferenceType=config.YOLO_BACKEND,
            model=config.MODEL_NAME,
        ):
            yolo = run_yolo_analysis(image_path=image_path, payload=payload)
    except RemoteYoloError as error:
        capture_exception(error, stage="yolo", visit_id=payload.visit_id, model=config.MODEL_NAME, inference_type=config.YOLO_BACKEND)
        raise HTTPException(status_code=502, detail=str(error)) from error
    llm = None
    if payload.use_llm:
        try:
            llm = analyze_retail_image(
                image_path=image_path,
                yolo=yolo,
                outlet_name=payload.outlet_name,
                rep_notes=payload.rep_notes,
            )
        except Exception as error:
            warnings.append("LLM analysis failed; using YOLO-only compliance fallback.")
            capture_exception(error, stage="openai_posm", visit_id=payload.visit_id, model=config.LLM_MODEL, inference_type="vision")
            log_event(
                "llm_analysis_failed",
                visitId=payload.visit_id,
                model=config.LLM_MODEL,
                error=str(error),
            )

    compliance = evaluate_compliance(yolo, llm)
    return ShelfAnalysisResponse(
        visitId=payload.visit_id,
        yolo=yolo,
        llm=llm,
        compliance=compliance,
        supervisorSummary=build_supervisor_summary(yolo, compliance, llm),
        warnings=warnings,
    )


@app.post("/rag/index-report", response_model=VisitReportIndexResponse)
def rag_index_report(payload: VisitReportIndexRequest) -> VisitReportIndexResponse:
    try:
        return index_visit_report(payload)
    except RagConfigurationError as error:
        capture_exception(error, stage="embedding", visit_id=payload.visit_id, model=config.EMBEDDING_MODEL, inference_type="embedding")
        raise HTTPException(status_code=503, detail=str(error)) from error
    except Exception as error:
        capture_exception(error, stage="embedding", visit_id=payload.visit_id, model=config.EMBEDDING_MODEL, inference_type="embedding")
        raise


@app.post("/assistant/query", response_model=AssistantQueryResponse)
def assistant_query(payload: AssistantQueryRequest) -> AssistantQueryResponse:
    if not payload.question.strip():
        raise HTTPException(status_code=400, detail="question is required")
    try:
        return query_assistant(payload)
    except Exception as error:
        capture_exception(error, stage="assistant", model=config.CHAT_MODEL, inference_type="rag_query")
        raise


def resolve_request_image(payload: YoloDetectRequest):
    if payload.image_path:
        return ensure_image_path(payload.image_path)
    if payload.image_url:
        return download_image(payload.image_url, config.UPLOAD_DIR)
    raise ValueError("Either imagePath or imageUrl is required.")


@app.post("/detect-yolo/upload", response_model=YoloResponse)
def detect_yolo_upload(
    file: UploadFile = File(...),
    visit_id: str | None = Form(default=None),
    confidence: float = Form(default=config.DEFAULT_CONFIDENCE),
    image_size: int = Form(default=config.DEFAULT_IMAGE_SIZE),
    save_overlay: bool = Form(default=True),
) -> YoloResponse:
    try:
        image_path = save_upload(file, config.UPLOAD_DIR)
        payload = YoloDetectRequest(
            visitId=visit_id,
            imagePath=str(image_path),
            confidence=confidence,
            imageSize=image_size,
            saveOverlay=save_overlay,
        )
        with observe_latency(
            yolo_latency,
            (config.YOLO_BACKEND,),
            "yolo_upload_detection_completed",
            visitId=visit_id,
            stage="yolo",
            inferenceType=config.YOLO_BACKEND,
            model=config.MODEL_NAME,
        ):
            return run_yolo_analysis(image_path=image_path, payload=payload)
    except ValueError as error:
        capture_exception(error, stage="yolo", visit_id=visit_id, model=config.MODEL_NAME, inference_type=config.YOLO_BACKEND)
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RemoteYoloError as error:
        capture_exception(error, stage="yolo", visit_id=visit_id, model=config.MODEL_NAME, inference_type=config.YOLO_BACKEND)
        raise HTTPException(status_code=502, detail=str(error)) from error
