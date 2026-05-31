from .schemas import ComplianceResult, DetectionCounts, LLMRetailAnalysis, YoloResponse


def status_for_score(score: int) -> str:
    if score >= 80:
        return "excellent"
    if score >= 60:
        return "acceptable"
    if score >= 40:
        return "poor"
    return "critical"


def evaluate_compliance(yolo: YoloResponse, llm: LLMRetailAnalysis | None = None) -> ComplianceResult:
    score = 100
    reasons: list[str] = []
    counts, visibility_ratio, _used_count_audit = effective_shelf_metrics(yolo, llm)

    if counts.total == 0:
        score -= 75
        reasons.append("No shelf products were detected in the image.")
    elif counts.olympic == 0:
        score -= 45
        reasons.append("No Olympic products were detected.")

    if visibility_ratio < 0.25:
        score -= 25
        reasons.append("Olympic visibility is below the minimum target.")
    elif visibility_ratio < 0.5:
        score -= 15
        reasons.append("Olympic visibility is weaker than desired.")

    if counts.competitor > counts.olympic and counts.competitor >= 3:
        score -= 20
        reasons.append("Competitor products dominate visible shelf space.")
    elif counts.competitor > 0:
        score -= 5
        reasons.append("Competitor products are present.")

    if llm and not llm.posm.detected:
        score -= 15
        reasons.append("POSM was not detected in the shelf image.")
    elif llm and llm.posm.detected:
        reasons.append("POSM appears to be present.")

    if counts.olympic > 0 and visibility_ratio >= 0.5:
        reasons.append("Olympic products have acceptable shelf visibility.")

    score = max(0, min(100, score))
    status = status_for_score(score)

    if status in {"critical", "poor"}:
        recommended_action = "Request a revisit with improved Olympic shelf visibility and clearer merchandising evidence."
    elif status == "acceptable":
        recommended_action = "Monitor this outlet and improve Olympic share-of-shelf where possible."
    else:
        recommended_action = "Outlet appears compliant. Continue routine monitoring."

    return ComplianceResult(
        score=score,
        status=status,
        reasons=reasons or ["Shelf appears compliant based on current detection results."],
        recommendedAction=recommended_action,
    )


def effective_shelf_metrics(
    yolo: YoloResponse,
    llm: LLMRetailAnalysis | None = None,
) -> tuple[DetectionCounts, float, bool]:
    audit = llm.count_audit if llm else None
    if (
        audit
        and not audit.yolo_count_reliable
        and audit.confidence >= 0.65
        and audit.olympic_estimate is not None
        and audit.competitor_estimate is not None
    ):
        olympic = max(0, audit.olympic_estimate)
        competitor = max(0, audit.competitor_estimate)
        total = olympic + competitor
        visibility_ratio = audit.visual_olympic_share
        if visibility_ratio is None:
            visibility_ratio = olympic / total if total else 0.0
        return (
            DetectionCounts(olympic=olympic, competitor=competitor, total=total),
            max(0.0, min(1.0, visibility_ratio)),
            True,
        )

    return yolo.counts, yolo.metrics.visibility_ratio, False


def build_supervisor_summary(
    yolo: YoloResponse,
    compliance: ComplianceResult,
    llm: LLMRetailAnalysis | None = None,
) -> str:
    if llm and llm.supervisor_summary:
        return llm.supervisor_summary

    if compliance.status in {"critical", "poor"}:
        if yolo.counts.olympic == 0:
            return "Outlet is failing compliance because no Olympic products were detected and competitor presence is high."
        if yolo.counts.competitor > yolo.counts.olympic:
            return "Outlet has weak Olympic visibility and competitor products dominate the shelf."
        return "Outlet has poor Olympic shelf visibility and needs supervisor review."

    if compliance.status == "acceptable":
        return "Outlet is mostly compliant, but Olympic visibility can still be improved."

    return "Outlet has strong Olympic shelf visibility and appears compliant."
