from pathlib import Path
import os


PROJECT_ROOT = Path(__file__).resolve().parents[2]


try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None


if load_dotenv:
    load_dotenv(PROJECT_ROOT / ".env")
    load_dotenv(PROJECT_ROOT / "ai_service" / ".env")


def _path_from_env(name: str, fallback: Path) -> Path:
    raw = os.getenv(name)
    return Path(raw).expanduser().resolve() if raw else fallback.resolve()


def _float_from_env(name: str, fallback: float) -> float:
    raw = os.getenv(name)
    if not raw:
        return fallback
    try:
        return float(raw)
    except ValueError:
        return fallback


def _int_from_env(name: str, fallback: int) -> int:
    raw = os.getenv(name)
    if not raw:
        return fallback
    try:
        return int(raw)
    except ValueError:
        return fallback


def _bool_from_env(name: str, fallback: bool) -> bool:
    raw = os.getenv(name)
    if not raw:
        return fallback
    return raw.lower() in {"1", "true", "yes", "on"}


MODEL_PATH = _path_from_env(
    "RETAILOS_YOLO_MODEL_PATH",
    PROJECT_ROOT / "Detection Model" / "best.pt",
)
UPLOAD_DIR = _path_from_env(
    "RETAILOS_UPLOAD_DIR",
    PROJECT_ROOT / "ai_service" / "storage" / "uploads",
)
OVERLAY_DIR = _path_from_env(
    "RETAILOS_OVERLAY_DIR",
    PROJECT_ROOT / "ai_service" / "storage" / "overlays",
)

MODEL_NAME = os.getenv("RETAILOS_YOLO_MODEL_NAME", "retail-shelf-yolo")
MODEL_VERSION = os.getenv("RETAILOS_YOLO_MODEL_VERSION", "v1")
DEFAULT_CONFIDENCE = _float_from_env("RETAILOS_YOLO_CONFIDENCE", 0.25)
DEFAULT_IMAGE_SIZE = _int_from_env("RETAILOS_YOLO_IMAGE_SIZE", 1280)
PUBLIC_BASE_URL = os.getenv("RETAILOS_PUBLIC_BASE_URL", "").rstrip("/")
YOLO_BACKEND = os.getenv("RETAILOS_YOLO_BACKEND", "local").lower()
MODAL_YOLO_URL = os.getenv("RETAILOS_MODAL_YOLO_URL", "").strip()
MODAL_YOLO_TOKEN = os.getenv("RETAILOS_MODAL_YOLO_TOKEN", "").strip()
YOLO_FALLBACK_LOCAL = _bool_from_env("RETAILOS_YOLO_FALLBACK_LOCAL", True)
AI_SERVICE_API_KEY = os.getenv("RETAILOS_AI_SERVICE_API_KEY", os.getenv("AI_SERVICE_API_KEY", "")).strip()
AI_SERVICE_RATE_LIMIT_ENABLED = _bool_from_env("AI_SERVICE_RATE_LIMIT_ENABLED", True)
AI_SERVICE_RATE_LIMIT_PER_MINUTE = _int_from_env("AI_SERVICE_RATE_LIMIT_PER_MINUTE", 60)
AI_SERVICE_RATE_LIMIT_FAIL_OPEN = _bool_from_env("AI_SERVICE_RATE_LIMIT_FAIL_OPEN", False)
AI_SERVICE_RATE_LIMIT_REDIS_URL = os.getenv(
    "AI_SERVICE_RATE_LIMIT_REDIS_URL",
    os.getenv("RATE_LIMIT_REDIS_URL", os.getenv("REDIS_URL", "redis://127.0.0.1:6379")),
).strip()
APP_ENV = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "development"))
SENTRY_DSN = os.getenv("SENTRY_DSN", "").strip()
SENTRY_RELEASE = os.getenv("SENTRY_RELEASE", "").strip()
SENTRY_TRACES_SAMPLE_RATE = _float_from_env("SENTRY_TRACES_SAMPLE_RATE", 0.1)
CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv("RETAILOS_CORS_ORIGINS", "*").split(",")
    if origin.strip()
]

LLM_PROVIDER = os.getenv("RETAILOS_LLM_PROVIDER", "openai").lower()
LLM_MODEL = os.getenv("RETAILOS_LLM_MODEL", "gpt-5.4-mini")
LLM_ENABLED = _bool_from_env("RETAILOS_LLM_ENABLED", True)

CHAT_MODEL = os.getenv("RETAILOS_CHAT_MODEL", LLM_MODEL)
EMBEDDING_MODEL = os.getenv("RETAILOS_EMBEDDING_MODEL", "text-embedding-3-small")
EMBEDDING_DIMENSIONS = _int_from_env("RETAILOS_EMBEDDING_DIMENSIONS", 0)
PINECONE_API_KEY = os.getenv("PINECONE_API_KEY", "").strip()
PINECONE_INDEX = os.getenv("PINECONE_INDEX", os.getenv("PINECONE_INDEX_NAME", "")).strip()
PINECONE_HOST = os.getenv("PINECONE_HOST", "").strip().rstrip("/")
PINECONE_NAMESPACE = os.getenv("PINECONE_NAMESPACE", "retailos-visit-reports").strip()


def readiness_errors() -> list[str]:
    errors: list[str] = []
    if YOLO_BACKEND == "local" and not MODEL_PATH.exists():
        errors.append(f"YOLO model file does not exist: {MODEL_PATH}")
    if YOLO_BACKEND == "modal" and not MODAL_YOLO_URL:
        errors.append("RETAILOS_MODAL_YOLO_URL is required when RETAILOS_YOLO_BACKEND=modal")
    if YOLO_BACKEND not in {"local", "modal"}:
        errors.append("RETAILOS_YOLO_BACKEND must be either local or modal")
    if requires_ai_service_api_key() and not AI_SERVICE_API_KEY:
        errors.append("RETAILOS_AI_SERVICE_API_KEY is required outside local/development/test environments")
    return errors


def requires_ai_service_api_key() -> bool:
    return APP_ENV.lower() not in {"local", "development", "dev", "test"}
