# Modal GPU YOLO Inference

Modal should be used as the distributed GPU backend for YOLO inference, while keeping local YOLO as the development fallback.

## Why

The local FastAPI service proves the model works, but it is single-machine limited. Modal gives the project a stronger distributed systems story:

```text
BullMQ worker
  -> FastAPI /analyze-shelf
  -> Modal GPU YOLO endpoint
  -> OpenAI vision POSM analysis
  -> compliance scoring
  -> Postgres results
```

This keeps the request path async and keeps GPU work off local laptops or CPU-only hosts.

## Deployment

Install and authenticate Modal:

```powershell
python -m pip install modal
modal setup
```

Deploy the YOLO endpoint:

```powershell
modal deploy modal_gpu/yolo_endpoint.py
```

Modal prints a stable HTTPS URL for the `detect` endpoint. Put that URL in `.env`:

```env
RETAILOS_YOLO_BACKEND=modal
RETAILOS_MODAL_YOLO_URL=https://your-workspace--retailos-yolo-gpu-yologpuendpoint-detect.modal.run
RETAILOS_YOLO_FALLBACK_LOCAL=true
```

Then restart the local AI service:

```powershell
uvicorn ai_service.app.main:app --reload --port 8001
```

## Runtime Behavior

When `RETAILOS_YOLO_BACKEND=modal`:

- `/analyze-shelf` sends the image to Modal as base64.
- Modal runs YOLO on a GPU.
- Modal returns normalized detections, counts, areas, and visibility ratios.
- The local AI service can still generate overlays from returned boxes.
- If Modal fails and `RETAILOS_YOLO_FALLBACK_LOCAL=true`, the service falls back to local YOLO.

## What Stays Local

- LLM POSM analysis
- Compliance scoring
- Overlay generation
- Fraud/context merging
- Worker orchestration

This avoids duplicating the whole AI service on Modal. Modal is used for the heavy GPU-specific part only.

## Demo Talking Point

"The visit request never waits for image analysis. BullMQ picks up the job, calls our AI service, and YOLO inference is routed to Modal GPU with local fallback. The pipeline is distributed, observable, and horizontally scalable."

## License Note

Ultralytics YOLO packages are AGPL-licensed unless a commercial license is used. For an internship prototype this may be fine, but production use should review the license.

