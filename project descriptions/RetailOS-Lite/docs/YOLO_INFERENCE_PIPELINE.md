# YOLO Inference Pipeline

This is the first working vertical slice for RetailOS Lite.

## What Works Now

```text
image path or upload
  -> FastAPI /detect-yolo
  -> best.pt YOLO inference
  -> normalized detections
  -> Olympic/competitor counts
  -> visibility metrics
  -> optional annotated overlay
```

For the workflow, use `/analyze-shelf`:

```text
image path or URL
  -> FastAPI /analyze-shelf
  -> YOLO inference
  -> optional vision LLM POSM analysis
  -> compliance scoring
  -> supervisor summary
```

## Model

Default model path:

```text
Detection Model/best.pt
```

Detected classes:

```text
0: foodie_noodles_olympics
1: mr_noodles_competitor
```

## Run Smoke Test

```powershell
$env:PYTHONUTF8='1'
python ai_service/scripts/test_inference.py --visit-id smoke_visit
```

Expected output includes:

- `modelName`
- `modelVersion`
- `counts.olympic`
- `counts.competitor`
- `metrics.visibilityRatio`
- `overlayImageUrl`

## Start API

```powershell
$env:PYTHONUTF8='1'
uvicorn ai_service.app.main:app --reload --port 8001
```

## JSON Request

```http
POST /detect-yolo
Content-Type: application/json
```

```json
{
  "visitId": "visit_123",
  "imagePath": "E:\\Projects\\RetailOS-Lite\\Detection Model\\yolo_dataset\\images\\val\\olympic_poc_image_94.jpg",
  "confidence": 0.25,
  "saveOverlay": true
}
```

## Shelf Analysis Request

```http
POST /analyze-shelf
Content-Type: application/json
```

```json
{
  "visitId": "visit_123",
  "imagePath": "E:\\Projects\\RetailOS-Lite\\Detection Model\\yolo_dataset\\images\\val\\olympic_poc_image_94.jpg",
  "confidence": 0.25,
  "saveOverlay": true,
  "useLlm": true,
  "outletName": "Rahim Store",
  "repNotes": "Shelf near front counter."
}
```

This endpoint wraps YOLO with optional LLM POSM analysis, compliance scoring, and a supervisor summary. The worker should call this endpoint first.

## LLM POSM Layer

YOLO handles trained product classes:

- Olympic products
- Competitor products

The vision LLM handles visual retail context that is hard to detect without labeled data:

- Olympic POSM presence
- Shelf neatness
- Promotional signage
- Evidence for supervisor review
- Human-readable recommendation

If `OPENAI_API_KEY` is missing, the response still succeeds with `llm: null`.

When enabled, the response includes:

```json
{
  "llm": {
    "provider": "openai",
    "model": "gpt-4o-mini",
    "posm": {
      "detected": false,
      "confidence": 0.82,
      "evidence": "No visible Olympic branded poster, shelf strip, dangler, or promotional sign.",
      "missingReason": "Shelf image only shows products and no promotional material."
    },
    "shelfQuality": "Shelf is visible but competitor products dominate.",
    "visibilityNotes": "Olympic visibility is weak based on detected products.",
    "competitorNotes": "Competitor products occupy most detected shelf positions.",
    "supervisorSummary": "Outlet has poor Olympic visibility and no visible POSM.",
    "recommendedAction": "Request POSM placement and improve Olympic shelf share."
  }
}
```

Missing POSM subtracts from the compliance score only when LLM analysis is available.

Important: `llm.posm.detected` means Olympic-branded POSM only. Other promotional material should be described in `llm.otherPromotionalMaterial` and must not count as compliant Olympic POSM.

## Response Contract

```json
{
  "visitId": "visit_123",
  "modelName": "retail-shelf-yolo",
  "modelVersion": "v1",
  "analysisSource": "YOLO",
  "imageWidth": 1280,
  "imageHeight": 720,
  "confidenceThreshold": 0.25,
  "inferenceMs": 261.41,
  "counts": {
    "olympic": 0,
    "competitor": 22,
    "total": 22
  },
  "areas": {
    "olympic": 0,
    "competitor": 142061.61,
    "total": 142061.61
  },
  "metrics": {
    "countRatio": 0,
    "visibilityRatio": 0,
    "olympicAreaRatio": 0,
    "competitorAreaRatio": 0.1541
  },
  "detections": [],
  "overlayImageUrl": "/artifacts/overlays/visit_123_overlay.jpg"
}
```

## Next Integration Step

The worker should call `/analyze-shelf` inside `analyze_visit`, then store:

- `analysisSource`
- `modelName`
- `modelVersion`
- `counts`
- `metrics`
- `detections`
- `overlayImageUrl`
- `llm.posm`
- `compliance.score`
- `compliance.status`
- `compliance.reasons`
- `supervisorSummary`

Then the dashboard can immediately show the image, overlay, counts, compliance score, reasons, and summary.
