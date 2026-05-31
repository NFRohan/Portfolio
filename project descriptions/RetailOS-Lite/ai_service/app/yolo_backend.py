from pathlib import Path
import base64
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from . import config
from .overlay import draw_overlay
from .schemas import YoloDetectRequest, YoloResponse
from .yolo_detector import get_detector


class RemoteYoloError(RuntimeError):
    pass


def run_yolo_analysis(image_path: Path, payload: YoloDetectRequest) -> YoloResponse:
    if config.YOLO_BACKEND == "modal":
        try:
            return run_modal_yolo(image_path, payload)
        except RemoteYoloError:
            if not config.YOLO_FALLBACK_LOCAL:
                raise

    detector = get_detector()
    return detector.predict(
        image_path=image_path,
        visit_id=payload.visit_id,
        confidence=payload.confidence or config.DEFAULT_CONFIDENCE,
        image_size=payload.image_size or config.DEFAULT_IMAGE_SIZE,
        save_overlay=payload.save_overlay,
    )


def run_modal_yolo(image_path: Path, payload: YoloDetectRequest) -> YoloResponse:
    if not config.MODAL_YOLO_URL:
        raise RemoteYoloError("RETAILOS_MODAL_YOLO_URL is required when RETAILOS_YOLO_BACKEND=modal.")

    request_body = {
        "visitId": payload.visit_id,
        "imageBase64": base64.b64encode(image_path.read_bytes()).decode("utf-8"),
        "confidence": payload.confidence or config.DEFAULT_CONFIDENCE,
        "imageSize": payload.image_size or config.DEFAULT_IMAGE_SIZE,
    }
    headers = {"Content-Type": "application/json"}
    if config.MODAL_YOLO_TOKEN:
        headers["Authorization"] = f"Bearer {config.MODAL_YOLO_TOKEN}"

    request = Request(
        config.MODAL_YOLO_URL,
        data=json.dumps(request_body).encode("utf-8"),
        headers=headers,
        method="POST",
    )

    try:
        with urlopen(request, timeout=60) as response:
            raw = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RemoteYoloError(f"Modal YOLO endpoint returned {error.code}: {detail}") from error
    except (URLError, TimeoutError) as error:
        raise RemoteYoloError(f"Modal YOLO endpoint failed: {error}") from error

    yolo = YoloResponse.model_validate(raw)
    if payload.save_overlay and not yolo.overlay_image_url:
        overlay_url = draw_overlay(
            image_path=image_path,
            detections=yolo.detections,
            overlay_dir=config.OVERLAY_DIR,
            public_base_url=config.PUBLIC_BASE_URL,
            visit_id=payload.visit_id,
        )
        yolo = yolo.model_copy(update={"overlay_image_url": overlay_url})
    return yolo

