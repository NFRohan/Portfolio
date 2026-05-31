from pathlib import Path
import uuid

import cv2

from .schemas import Detection


COLORS = {
    "olympic": (36, 178, 76),
    "competitor": (52, 84, 235),
    "other": (180, 180, 180),
}


def make_public_artifact_url(path: Path, public_base_url: str) -> str:
    relative_url = f"/artifacts/overlays/{path.name}"
    return f"{public_base_url}{relative_url}" if public_base_url else relative_url


def draw_overlay(
    image_path: Path,
    detections: list[Detection],
    overlay_dir: Path,
    public_base_url: str,
    visit_id: str | None = None,
) -> str | None:
    image = cv2.imread(str(image_path))
    if image is None:
        return None

    for detection in detections:
        color = COLORS.get(detection.category, COLORS["other"])
        x1 = int(detection.box.x)
        y1 = int(detection.box.y)
        x2 = int(detection.box.x + detection.box.width)
        y2 = int(detection.box.y + detection.box.height)
        label = f"{detection.label} {detection.confidence:.2f}"

        cv2.rectangle(image, (x1, y1), (x2, y2), color, 2)
        label_size, _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.48, 1)
        label_w, label_h = label_size
        cv2.rectangle(image, (x1, max(0, y1 - label_h - 8)), (x1 + label_w + 8, y1), color, -1)
        cv2.putText(
            image,
            label,
            (x1 + 4, max(12, y1 - 5)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.48,
            (255, 255, 255),
            1,
            cv2.LINE_AA,
        )

    overlay_dir.mkdir(parents=True, exist_ok=True)
    prefix = visit_id or image_path.stem
    target = overlay_dir / f"{prefix}_{uuid.uuid4().hex[:8]}_overlay.jpg"
    cv2.imwrite(str(target), image)
    return make_public_artifact_url(target, public_base_url)

