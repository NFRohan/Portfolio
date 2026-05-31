from pathlib import Path
import base64
import json
import mimetypes
import os

from . import config
from .observability import capture_exception, observe_latency, openai_latency
from .schemas import CountAudit, LLMRetailAnalysis, POSMAnalysis, YoloResponse


POSM_SCHEMA = {
    "type": "object",
    "properties": {
        "posm": {
            "type": "object",
            "properties": {
                "detected": {"type": "boolean"},
                "confidence": {"type": "number"},
                "evidence": {"type": "string"},
                "missingReason": {"type": ["string", "null"]},
            },
            "required": ["detected", "confidence", "evidence", "missingReason"],
            "additionalProperties": False,
        },
        "countAudit": {
            "type": "object",
            "properties": {
                "olympicEstimate": {"type": ["integer", "null"]},
                "competitorEstimate": {"type": ["integer", "null"]},
                "visualOlympicShare": {"type": ["number", "null"]},
                "yoloCountReliable": {"type": "boolean"},
                "confidence": {"type": "number"},
                "rationale": {"type": "string"},
            },
            "required": [
                "olympicEstimate",
                "competitorEstimate",
                "visualOlympicShare",
                "yoloCountReliable",
                "confidence",
                "rationale",
            ],
            "additionalProperties": False,
        },
        "shelfQuality": {"type": "string"},
        "otherPromotionalMaterial": {"type": "string"},
        "visibilityNotes": {"type": "string"},
        "competitorNotes": {"type": "string"},
        "supervisorSummary": {"type": "string"},
        "recommendedAction": {"type": "string"},
    },
    "required": [
        "posm",
        "countAudit",
        "shelfQuality",
        "otherPromotionalMaterial",
        "visibilityNotes",
        "competitorNotes",
        "supervisorSummary",
        "recommendedAction",
    ],
    "additionalProperties": False,
}


def llm_is_configured() -> bool:
    return config.LLM_ENABLED and config.LLM_PROVIDER == "openai" and bool(os.getenv("OPENAI_API_KEY"))


def image_to_data_url(image_path: Path) -> str:
    content_type = mimetypes.guess_type(str(image_path))[0] or "image/jpeg"
    encoded = base64.b64encode(image_path.read_bytes()).decode("utf-8")
    return f"data:{content_type};base64,{encoded}"


def build_prompt(
    yolo: YoloResponse,
    outlet_name: str | None = None,
    rep_notes: str | None = None,
) -> str:
    return f"""
You are a retail execution auditor for Olympic brand's Foodie Noodles product shelf visibility.

Analyze the shelf image for:
- Olympic/Foodie POSM presence only: Olympic/Foodie branded posters, wobblers, shelf strips, danglers, signage, stickers, or promotional material.
- Shelf quality: neatness, visibility, whether the products are easy to see.
- Competitor pressure: whether competitor products visually dominate.
- Count audit: conservative visible estimates for Olympic/Foodie products and competitor products.
- Supervisor action: short, operational, and practical.

Use these YOLO detections as grounding facts:
- Olympic product count: {yolo.counts.olympic}
- Competitor product count: {yolo.counts.competitor}
- Olympic visibility ratio by detected area: {yolo.metrics.visibility_ratio}
- Outlet name: {outlet_name or "unknown"}
- Rep notes: {rep_notes or "none"}

Important POSM rule:
- posm.detected means Olympic/Foodie-branded POSM is clearly visible.
- Ignore unrelated POSM from other brands such as Nescafe, Pran, Mr. Noodles, or generic store signage.
- If non-Olympic/Foodie promotional material is visible, describe it in otherPromotionalMaterial but keep posm.detected false unless Olympic/Foodie branding is visible.

Important count audit rule:
- YOLO can miss small, hanging, occluded, or partially visible noodle packs.
- Use countAudit for conservative approximate visible counts only, not hidden stock.
- Set countAudit.yoloCountReliable false if the YOLO counts are visibly under-counting or over-counting the scene.
- Set countAudit.visualOlympicShare from 0 to 1 based on visible Olympic/Foodie share-of-shelf.
- If the image is too cluttered to estimate, use null estimates, confidence below 0.5, and explain why.

Do not invent exact precise counts. If Olympic/Foodie POSM is not clearly visible, mark posm.detected false.
Keep supervisorSummary under 25 words.
""".strip()


def parse_json_output(text: str) -> dict:
    cleaned = text.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()
    return json.loads(cleaned)


def analyze_retail_image(
    image_path: Path,
    yolo: YoloResponse,
    outlet_name: str | None = None,
    rep_notes: str | None = None,
) -> LLMRetailAnalysis | None:
    if not llm_is_configured():
        return None

    if config.LLM_PROVIDER != "openai":
        return None

    try:
        from openai import OpenAI
    except ImportError:
        return None

    client = OpenAI()
    image_url = image_to_data_url(image_path)
    prompt = build_prompt(yolo=yolo, outlet_name=outlet_name, rep_notes=rep_notes)

    try:
        with observe_latency(
            openai_latency,
            ("posm_vision", config.LLM_MODEL),
            "openai_posm_analysis_completed",
            stage="openai_posm",
            model=config.LLM_MODEL,
            visitId=yolo.visit_id,
        ):
            response = client.responses.create(
                model=config.LLM_MODEL,
                input=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "input_text", "text": prompt},
                            {"type": "input_image", "image_url": image_url, "detail": "low"},
                        ],
                    }
                ],
                text={
                    "format": {
                        "type": "json_schema",
                        "name": "retail_posm_analysis",
                        "strict": True,
                        "schema": POSM_SCHEMA,
                    }
                },
            )
    except Exception as error:
        capture_exception(error, stage="openai_posm", visit_id=yolo.visit_id, model=config.LLM_MODEL, inference_type="vision")
        raise

    parsed = parse_json_output(response.output_text)
    return LLMRetailAnalysis(
        provider="openai",
        model=config.LLM_MODEL,
        posm=POSMAnalysis(**parsed["posm"]),
        countAudit=CountAudit(**parsed["countAudit"]),
        otherPromotionalMaterial=parsed["otherPromotionalMaterial"],
        shelfQuality=parsed["shelfQuality"],
        visibilityNotes=parsed["visibilityNotes"],
        competitorNotes=parsed["competitorNotes"],
        supervisorSummary=parsed["supervisorSummary"],
        recommendedAction=parsed["recommendedAction"],
        raw=parsed,
    )
