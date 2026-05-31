import type { Prisma } from "@prisma/client";
import type { OutcomeSummary, VisitDetail, VisitListItem } from "@/lib/types";

type VisitWithRelations = Prisma.VisitGetPayload<{
  include: {
    outlet: true;
    rep: { select: { id: true; name: true; email: true } };
    images: true;
    aiResult: true;
    fraudSignals: true;
  };
}>;

export function serializeVisitDetail(visit: VisitWithRelations): VisitDetail {
  const outcome = visit.aiResult?.outcomeSummary as OutcomeSummary | null;
  const actionableFraudSignals = visit.fraudSignals.filter(isActionableFraudSignal);
  return {
    id: visit.id,
    status: visit.status,
    checkInLat: visit.checkInLat,
    checkInLng: visit.checkInLng,
    clientTimestamp: visit.clientTimestamp?.toISOString() ?? null,
    notes: visit.notes,
    createdAt: visit.createdAt.toISOString(),
    outlet: {
      id: visit.outlet.id,
      name: visit.outlet.name,
      code: visit.outlet.code,
      address: visit.outlet.address,
      latitude: visit.outlet.latitude,
      longitude: visit.outlet.longitude,
    },
    rep: visit.rep,
    images: visit.images.map((img) => ({
      id: img.id,
      url: img.url,
      localPath: img.localPath,
      imageHash: img.imageHash,
    })),
    aiResult: visit.aiResult
      ? {
          complianceScore: visit.aiResult.complianceScore,
          status: visit.aiResult.status,
          supervisorSummary: visit.aiResult.supervisorSummary,
          overlayImageUrl: visit.aiResult.overlayImageUrl,
          outcomeSummary: outcome,
          yoloDetections: visit.aiResult.yoloDetections,
        }
      : null,
    fraudSignals: actionableFraudSignals.map((f) => ({
      id: f.id,
      type: f.type,
      severity: f.severity,
      message: f.message,
    })),
  };
}

export function serializeVisitListItem(visit: VisitWithRelations): VisitListItem {
  const outcome = visit.aiResult?.outcomeSummary as OutcomeSummary | null;
  const actionableFraudSignals = visit.fraudSignals.filter(isActionableFraudSignal);
  const highFraud = actionableFraudSignals.some((f) => f.severity === "HIGH");
  const complianceScore = visit.aiResult?.complianceScore ?? null;
  const hasMissingPosm = posmDetected(visit.aiResult?.posm) === false || outcome?.posm.detected === false;
  const reviewReasons = reviewReasonsForVisit({
    visitStatus: visit.status,
    complianceScore,
    fraudSignals: actionableFraudSignals,
    hasMissingPosm,
    outcome,
  });
  const riskStatus = riskStatusForVisit({
    visitStatus: visit.status,
    complianceScore,
    fraudCount: actionableFraudSignals.length,
    highFraud,
    hasMissingPosm,
  });

  return {
    id: visit.id,
    status: visit.status,
    createdAt: visit.createdAt.toISOString(),
    timestamp: visit.createdAt.toISOString(),
    outletName: visit.outlet.name,
    outletCode: visit.outlet.code,
    repName: visit.rep.name,
    complianceScore,
    complianceStatus: visit.aiResult?.status ?? outcome?.complianceStatus ?? null,
    supervisorSummary: visit.aiResult?.supervisorSummary ?? outcome?.supervisorSummary ?? null,
    fraudCount: actionableFraudSignals.length,
    hasHighFraud: highFraud,
    hasMissingPosm,
    reviewReasons,
    riskStatus,
  };
}

function posmDetected(posm: unknown): boolean | null {
  if (!posm || typeof posm !== "object") return null;
  const detected = (posm as { detected?: unknown }).detected;
  return typeof detected === "boolean" ? detected : null;
}

function isActionableFraudSignal(signal: { type: string }): boolean {
  return signal.type !== "IMAGE_HASHED";
}

function reviewReasonsForVisit({
  visitStatus,
  complianceScore,
  fraudSignals,
  hasMissingPosm,
  outcome,
}: {
  visitStatus: string;
  complianceScore: number | null;
  fraudSignals: VisitWithRelations["fraudSignals"];
  hasMissingPosm: boolean;
  outcome: OutcomeSummary | null;
}): string[] {
  const reasons: string[] = [];

  if (fraudSignals.length > 0) {
    const highSeverity = fraudSignals.filter((signal) => signal.severity === "HIGH");
    const signals = highSeverity.length > 0 ? highSeverity : fraudSignals;
    reasons.push(
      ...signals.slice(0, 2).map((signal) => `${humanizeSignalType(signal.type)}: ${signal.message}`),
    );
  }

  if (complianceScore !== null && complianceScore < 50) {
    reasons.push(`Critical AI compliance score (${complianceScore}%)`);
  } else if (complianceScore !== null && complianceScore < 70) {
    reasons.push(`AI compliance below 70% target (${complianceScore}%)`);
  }

  if (hasMissingPosm) {
    const missingReason = outcome?.posm.missingReason?.trim();
    reasons.push(missingReason ? `Missing POSM: ${missingReason}` : "Missing POSM");
  }

  if (visitStatus === "FLAGGED" && reasons.length === 0) {
    reasons.push("AI worker flagged this visit for supervisor review");
  }

  if (visitStatus === "FAILED") {
    reasons.push("AI analysis failed");
  }

  return [...new Set(reasons)];
}

function riskStatusForVisit({
  visitStatus,
  complianceScore,
  fraudCount,
  highFraud,
  hasMissingPosm,
}: {
  visitStatus: string;
  complianceScore: number | null;
  fraudCount: number;
  highFraud: boolean;
  hasMissingPosm: boolean;
}): VisitListItem["riskStatus"] {
  if (highFraud || (complianceScore !== null && complianceScore < 50)) return "HIGH_RISK";
  if (visitStatus === "FLAGGED" || fraudCount > 0 || hasMissingPosm || (complianceScore !== null && complianceScore < 70)) {
    return "REVIEW_NEEDED";
  }
  return "SAFE";
}

function humanizeSignalType(type: string): string {
  return type
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
