from pathlib import Path
import base64
import time

import modal


APP_NAME = "retailos-yolo-gpu"
REMOTE_MODEL_PATH = "/root/models/best.pt"
LOCAL_MODEL_PATH = Path(__file__).resolve().parents[1] / "Detection Model" / "best.pt"
DEFAULT_IMAGE_SIZE = 1280


image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install(["libgl1-mesa-glx", "libglib2.0-0"])
    .pip_install(
        "fastapi[standard]>=0.115.0",
        "ultralytics>=8.4.0",
        "opencv-python-headless>=4.10.0",
        "numpy>=1.26.0",
    )
    .add_local_file(str(LOCAL_MODEL_PATH), REMOTE_MODEL_PATH)
)

app = modal.App(APP_NAME)


def category_for(label: str, class_id: int) -> str:
    normalized = label.lower()
    if "olympic" in normalized or class_id == 0:
        return "olympic"
    if "competitor" in normalized or class_id == 1:
        return "competitor"
    return "other"


@app.cls(
    image=image,
    gpu="T4",
    timeout=120,
    scaledown_window=300,
)
@modal.concurrent(max_inputs=4)
class YoloGpuEndpoint:
    @modal.enter()
    def load_model(self):
        from ultralytics import YOLO

        self.model = YOLO(REMOTE_MODEL_PATH)
        self.names = self.model.names

    @modal.fastapi_endpoint(method="POST", docs=True)
    def detect(self, payload: dict) -> dict:
        import cv2
        import numpy as np

        image_base64 = payload.get("imageBase64")
        if not image_base64:
            return {"error": "imageBase64 is required"}

        visit_id = payload.get("visitId")
        confidence = float(payload.get("confidence", 0.25))
        image_size = int(payload.get("imageSize", DEFAULT_IMAGE_SIZE))

        image_bytes = base64.b64decode(image_base64)
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        image = cv2.imdecode(image_array, cv2.IMREAD_COLOR)
        if image is None:
            return {"error": "Could not decode imageBase64"}

        started = time.perf_counter()
        result = self.model.predict(
            image,
            conf=confidence,
            imgsz=image_size,
            verbose=False,
        )[0]
        inference_ms = round((time.perf_counter() - started) * 1000, 2)

        image_height, image_width = result.orig_shape
        image_area = float(image_width * image_height)
        detections = []
        olympic_count = 0
        competitor_count = 0
        olympic_area = 0.0
        competitor_area = 0.0

        for box in result.boxes:
            class_id = int(box.cls[0].item())
            label = self.names.get(class_id, str(class_id))
            x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
            width = max(0.0, x2 - x1)
            height = max(0.0, y2 - y1)
            area = width * height
            category = category_for(label, class_id)

            if category == "olympic":
                olympic_count += 1
                olympic_area += area
            elif category == "competitor":
                competitor_count += 1
                competitor_area += area

            detections.append(
                {
                    "label": label,
                    "classId": class_id,
                    "category": category,
                    "confidence": round(float(box.conf[0].item()), 4),
                    "box": {
                        "x": round(x1, 2),
                        "y": round(y1, 2),
                        "width": round(width, 2),
                        "height": round(height, 2),
                    },
                    "area": round(area, 2),
                }
            )

        total_count = len(detections)
        total_area = olympic_area + competitor_area
        count_ratio = olympic_count / total_count if total_count else 0.0
        visibility_ratio = olympic_area / total_area if total_area else 0.0

        return {
            "visitId": visit_id,
            "modelName": "retail-shelf-yolo",
            "modelVersion": "modal-gpu-v1",
            "analysisSource": "YOLO_MODAL_GPU",
            "imageWidth": image_width,
            "imageHeight": image_height,
            "confidenceThreshold": confidence,
            "inputImageSize": image_size,
            "inferenceMs": inference_ms,
            "counts": {
                "olympic": olympic_count,
                "competitor": competitor_count,
                "total": total_count,
            },
            "areas": {
                "olympic": round(olympic_area, 2),
                "competitor": round(competitor_area, 2),
                "total": round(total_area, 2),
            },
            "metrics": {
                "countRatio": round(count_ratio, 4),
                "visibilityRatio": round(visibility_ratio, 4),
                "olympicAreaRatio": round(olympic_area / image_area if image_area else 0.0, 4),
                "competitorAreaRatio": round(competitor_area / image_area if image_area else 0.0, 4),
            },
            "detections": detections,
            "overlayImageUrl": None,
        }
