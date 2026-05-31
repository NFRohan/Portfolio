from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen
import shutil
import uuid

from fastapi import UploadFile


ALLOWED_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def ensure_image_path(path: str | Path) -> Path:
    image_path = Path(path).expanduser().resolve()
    if not image_path.exists():
        raise FileNotFoundError(f"Image path does not exist: {image_path}")
    if image_path.suffix.lower() not in ALLOWED_IMAGE_SUFFIXES:
        raise ValueError(f"Unsupported image type: {image_path.suffix}")
    return image_path


def save_upload(upload: UploadFile, upload_dir: Path) -> Path:
    suffix = Path(upload.filename or "").suffix.lower() or ".jpg"
    if suffix not in ALLOWED_IMAGE_SUFFIXES:
        raise ValueError(f"Unsupported image type: {suffix}")

    upload_dir.mkdir(parents=True, exist_ok=True)
    target = upload_dir / f"{uuid.uuid4().hex}{suffix}"
    with target.open("wb") as handle:
        shutil.copyfileobj(upload.file, handle)
    return target


def download_image(image_url: str, upload_dir: Path) -> Path:
    parsed = urlparse(image_url)
    suffix = Path(parsed.path).suffix.lower() or ".jpg"
    if suffix not in ALLOWED_IMAGE_SUFFIXES:
        suffix = ".jpg"

    upload_dir.mkdir(parents=True, exist_ok=True)
    target = upload_dir / f"{uuid.uuid4().hex}{suffix}"
    request = Request(image_url, headers={"User-Agent": "RetailOS-Lite/1.0"})
    with urlopen(request, timeout=20) as response:
        target.write_bytes(response.read())
    return target

