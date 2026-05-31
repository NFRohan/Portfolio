import type { AnalyzeShelfResponse } from "../types/ai.js";
import type { FraudSignal, Visit, VisitReportRecord } from "../types/domain.js";

export function buildVisitReport(
  visit: Visit,
  analysis: AnalyzeShelfResponse,
  fraudSignals: FraudSignal[],
): VisitReportRecord {
  const title = `${visit.outlet.name} visit compliance ${analysis.compliance.score}`;
  const fraudSummary =
    fraudSignals.length > 0
      ? fraudSignals.map((signal) => `${signal.type}: ${signal.message}`).join("; ")
      : "No fraud signals detected.";

  const retrievalText = [
    `Outlet: ${visit.outlet.name}`,
    `Outlet ID: ${visit.outlet.id}`,
    `Visit ID: ${visit.id}`,
    `Rep ID: ${visit.repId}`,
    `Compliance Score: ${analysis.compliance.score}`,
    `Compliance Status: ${analysis.compliance.status}`,
    `Supervisor Summary: ${analysis.supervisorSummary}`,
    `Olympic Products Detected: ${analysis.yolo.counts.olympic}`,
    `Competitors Detected: ${analysis.yolo.counts.competitor}`,
    `Olympic Visibility Ratio: ${analysis.yolo.metrics.visibilityRatio}`,
    `POSM Detected: ${analysis.llm?.posm.detected ?? "unknown"}`,
    `POSM Evidence: ${analysis.llm?.posm.evidence ?? "LLM POSM analysis not available."}`,
    `Fraud Signals: ${fraudSummary}`,
    `Recommended Action: ${analysis.compliance.recommendedAction}`,
  ].join("\n");

  return {
    visitId: visit.id,
    outletId: visit.outletId,
    title,
    summary: analysis.supervisorSummary,
    retrievalText,
    facts: {
      compliance: analysis.compliance,
      counts: analysis.yolo.counts,
      metrics: analysis.yolo.metrics,
      posm: analysis.llm?.posm ?? null,
      fraudSignals,
    },
    createdAt: new Date().toISOString(),
  };
}

