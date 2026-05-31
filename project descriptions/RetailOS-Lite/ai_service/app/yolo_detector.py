from pathlib import Path
import time

from ultralytics import YOLO

from . import config
from .overlay import draw_overlay
from .schemas import (
    Detection,
    DetectionAreas,
    DetectionBox,
    DetectionCounts,
    DetectionMetrics,
    YoloResponse,
)


def _category_for(label: str, class_id: int) -> str:
    normalized = label.lower()
    if "olympic" in normalized or class_id == 0:
        return "olympic"
    if "competitor" in normalized or class_id == 1:
        return "competitor"
    return "other"


class YoloDetector:
    def __init__(self, model_path: Path):
        if not model_path.exists():
            raise FileNotFoundError(f"YOLO model not found at {model_path}")
        self.model_path = model_path
        self.model = YOLO(str(model_path))
        self.names = self.model.names

    def predict(
        self,
        image_path: Path,
        visit_id: str | None = None,
        confidence: float = config.DEFAULT_CONFIDENCE,
        image_size: int = config.DEFAULT_IMAGE_SIZE,
        save_overlay: bool = True,
    ) -> YoloResponse:
        started = time.perf_counter()
        result = self.model.predict(
            str(image_path),
            conf=confidence,
            imgsz=image_size,
            verbose=False,
        )[0]
        inference_ms = round((time.perf_counter() - started) * 1000, 2)

        image_height, image_width = result.orig_shape
        image_area = float(image_width * image_height)
        detections = self._normalize_detections(result)
        counts = self._counts(detections)
        areas = self._areas(detections)
        metrics = self._metrics(counts, areas, image_area)

        overlay_url = None
        if save_overlay:
            overlay_url = draw_overlay(
                image_path=image_path,
                detections=detections,
                overlay_dir=config.OVERLAY_DIR,
                public_base_url=config.PUBLIC_BASE_URL,
                visit_id=visit_id,
            )

        return YoloResponse(
            visitId=visit_id,
            modelName=config.MODEL_NAME,
            modelVersion=config.MODEL_VERSION,
            analysisSource="YOLO",
            imageWidth=image_width,
            imageHeight=image_height,
            confidenceThreshold=confidence,
            inputImageSize=image_size,
            inferenceMs=inference_ms,
            counts=counts,
            areas=areas,
            metrics=metrics,
            detections=detections,
            overlayImageUrl=overlay_url,
        )

    def _normalize_detections(self, result) -> list[Detection]:
        detections: list[Detection] = []
        for box in result.boxes:
            class_id = int(box.cls[0].item())
            label = self.names.get(class_id, str(class_id))
            x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
            width = max(0.0, x2 - x1)
            height = max(0.0, y2 - y1)
            category = _category_for(label, class_id)
            detections.append(
                Detection(
                    label=label,
                    classId=class_id,
                    category=category,
                    confidence=round(float(box.conf[0].item()), 4),
                    box=DetectionBox(
                        x=round(x1, 2),
                        y=round(y1, 2),
                        width=round(width, 2),
                        height=round(height, 2),
                    ),
                    area=round(width * height, 2),
                )
            )
        return detections

    @staticmethod
    def _counts(detections: list[Detection]) -> DetectionCounts:
        olympic = sum(1 for detection in detections if detection.category == "olympic")
        competitor = sum(1 for detection in detections if detection.category == "competitor")
        return DetectionCounts(
            olympic=olympic,
            competitor=competitor,
            total=len(detections),
        )

    @staticmethod
    def _areas(detections: list[Detection]) -> DetectionAreas:
        olympic = sum(detection.area for detection in detections if detection.category == "olympic")
        competitor = sum(detection.area for detection in detections if detection.category == "competitor")
        return DetectionAreas(
            olympic=round(olympic, 2),
            competitor=round(competitor, 2),
            total=round(olympic + competitor, 2),
        )

    @staticmethod
    def _metrics(
        counts: DetectionCounts,
        areas: DetectionAreas,
        image_area: float,
    ) -> DetectionMetrics:
        count_ratio = counts.olympic / counts.total if counts.total else 0.0
        visibility_ratio = areas.olympic / areas.total if areas.total else 0.0
        olympic_area_ratio = areas.olympic / image_area if image_area else 0.0
        competitor_area_ratio = areas.competitor / image_area if image_area else 0.0
        return DetectionMetrics(
            countRatio=round(count_ratio, 4),
            visibilityRatio=round(visibility_ratio, 4),
            olympicAreaRatio=round(olympic_area_ratio, 4),
            competitorAreaRatio=round(competitor_area_ratio, 4),
        )


_detector: YoloDetector | None = None


def get_detector() -> YoloDetector:
    global _detector
    if _detector is None:
        _detector = YoloDetector(config.MODEL_PATH)
    return _detector


def model_loaded() -> bool:
    return _detector is not None
