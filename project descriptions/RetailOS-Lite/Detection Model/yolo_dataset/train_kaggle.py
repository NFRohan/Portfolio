"""
YOLOv11 Medium — Kaggle/Modal Training Script
Upload this dataset, then run this in a notebook with GPU.
"""

# Install ultralytics
# !pip install -q ultralytics

from ultralytics import YOLO
import os

# ── Adjust this path based on your environment ──
# Kaggle:
DATASET_PATH = "/kaggle/input/olympic-shelf-dataset/olympic_shelf_dataset"
# Modal (adjust as needed):
# DATASET_PATH = "/data/olympic_shelf_dataset"

DATA_YAML = os.path.join(DATASET_PATH, "data.yaml")

# Load YOLOv11 Medium pretrained on COCO
model = YOLO("yolo11m.pt")

# Train
results = model.train(
    data=DATA_YAML,
    epochs=150,
    imgsz=1280,
    batch=16,
    patience=20,
    device=0,                # GPU
    workers=4,
    
    # Class imbalance handling
    cls=1.5,
    
    # Augmentation
    hsv_h=0.015,
    hsv_s=0.7,
    hsv_v=0.4,
    degrees=5.0,
    translate=0.1,
    scale=0.5,
    fliplr=0.5,
    mosaic=1.0,
    mixup=0.15,
    copy_paste=0.1,          # extra aug for medium model
    
    # Output
    project="/kaggle/working/runs",   # or adjust for Modal
    name="olympic_shelf_yolo11m",
    save=True,
    plots=True,
    verbose=True,
)

# Validate
metrics = model.val()
print(f"\nmAP50:    {metrics.box.map50:.4f}")
print(f"mAP50-95: {metrics.box.map:.4f}")

# ── Quick count test on val images ──
from pathlib import Path
import json

val_images = list(Path(os.path.join(DATASET_PATH, "images/val")).glob("*.jpg"))
count_results = []

for img_path in val_images[:10]:  # test on first 10
    preds = model.predict(str(img_path), conf=0.25, verbose=False)
    boxes = preds[0].boxes
    
    olympic_count = sum(1 for c in boxes.cls if int(c) == 0)
    competitor_count = sum(1 for c in boxes.cls if int(c) == 1)
    
    count_results.append({
        "image": img_path.name,
        "olympic_products": olympic_count,
        "competitor_products": competitor_count,
        "total": olympic_count + competitor_count
    })
    print(f"{img_path.name}: Olympic={olympic_count}, Competitor={competitor_count}")

# Save best model weights
import shutil
best_model = "/kaggle/working/runs/olympic_shelf_yolo11m/weights/best.pt"
shutil.copy(best_model, "/kaggle/working/best_olympic_shelf.pt")
print(f"\nBest model saved to: /kaggle/working/best_olympic_shelf.pt")
