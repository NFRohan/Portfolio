from pathlib import Path
import argparse
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

from ai_service.app import config
from ai_service.app.image_io import ensure_image_path
from ai_service.app.yolo_detector import get_detector


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a local YOLO inference smoke test.")
    parser.add_argument(
        "--image",
        default=str(ROOT / "Detection Model" / "yolo_dataset" / "images" / "val" / "olympic_poc_image_94.jpg"),
        help="Path to a shelf image.",
    )
    parser.add_argument("--visit-id", default="demo_visit")
    parser.add_argument("--confidence", type=float, default=config.DEFAULT_CONFIDENCE)
    parser.add_argument("--no-overlay", action="store_true")
    args = parser.parse_args()

    image_path = ensure_image_path(args.image)
    detector = get_detector()
    result = detector.predict(
        image_path=image_path,
        visit_id=args.visit_id,
        confidence=args.confidence,
        save_overlay=not args.no_overlay,
    )
    print(json.dumps(result.model_dump(by_alias=True), indent=2))


if __name__ == "__main__":
    main()

