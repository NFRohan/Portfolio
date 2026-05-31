import type { AnalyzeShelfResponse } from "../types/ai.js";
import type { FraudSignal, Visit } from "../types/domain.js";

export type VisitAnalysisOutcomeSummary = {
  visitId: string;
  outletName: string;
  finalStatus: string;
  complianceScore: number;
  complianceStatus: string;
  complianceReasons: string[];
  supervisorSummary: string;
  recommendedAction: string;
  counts: {
    olympic: number;
    competitor: number;
    total: number;
  };
  visibilityRatio: number;
  posm: {
    detected: boolean | null;
    evidence: string;
    missingReason?: string | null;
  };
  countAudit?: {
    olympicEstimate?: number | null;
    competitorEstimate?: number | null;
    visualOlympicShare?: number | null;
    yoloCountReliable: boolean;
    confidence: number;
    rationale: string;
  };
  fraudSignals: Array<{
    type: string;
    severity: string;
    message: string;
  }>;
};

export function buildOutcomeSummary(
  visit: Visit,
  analysis: AnalyzeShelfResponse,
  fraudSignals: FraudSignal[],
  finalStatus: string,
): VisitAnalysisOutcomeSummary {
  return {
    visitId: visit.id,
    outletName: visit.outlet.name,
    finalStatus,
    complianceScore: analysis.compliance.score,
    complianceStatus: analysis.compliance.status,
    complianceReasons: analysis.compliance.reasons,
    supervisorSummary: analysis.supervisorSummary,
    recommendedAction: analysis.compliance.recommendedAction,
    counts: analysis.yolo.counts,
    visibilityRatio: analysis.yolo.metrics.visibilityRatio,
    posm: {
      detected: analysis.llm?.posm.detected ?? null,
      evidence: analysis.llm?.posm.evidence ?? "POSM analysis not available.",
      missingReason: analysis.llm?.posm.missingReason,
    },
    countAudit: analysis.llm?.countAudit,
    fraudSignals: fraudSignals.map((signal) => ({
      type: signal.type,
      severity: signal.severity,
      message: signal.message,
    })),
  };
}

export function printOutcomeSummary(summary: VisitAnalysisOutcomeSummary): void {
  console.log(`\nVisit analysis completed for ${summary.outletName} (${summary.visitId})`);
  console.log(`Final status: ${summary.finalStatus}`);
  console.log(`Compliance: ${summary.complianceScore} (${summary.complianceStatus})`);
  console.log(`Supervisor summary: ${summary.supervisorSummary}`);
  console.log(`Recommended action: ${summary.recommendedAction}`);
  console.log(
    `Counts: Olympic=${summary.counts.olympic}, Competitor=${summary.counts.competitor}, Total=${summary.counts.total}`,
  );
  console.log(`Visibility ratio: ${summary.visibilityRatio}`);
  if (summary.countAudit) {
    console.log(
      `OpenAI count audit: reliable=${summary.countAudit.yoloCountReliable}, confidence=${summary.countAudit.confidence}, ` +
        `Olympic=${summary.countAudit.olympicEstimate ?? "unknown"}, ` +
        `Competitor=${summary.countAudit.competitorEstimate ?? "unknown"}`,
    );
  }
  console.log(`POSM: ${summary.posm.detected === null ? "unknown" : summary.posm.detected ? "detected" : "missing"}`);
  console.log(`POSM evidence: ${summary.posm.evidence}`);

  console.log("\nCompliance reasons:");
  for (const reason of summary.complianceReasons) {
    console.log(`- ${reason}`);
  }

  console.log("\nFraud signals:");
  if (summary.fraudSignals.length === 0) {
    console.log("- None");
  } else {
    for (const signal of summary.fraudSignals) {
      console.log(`- ${signal.severity} ${signal.type}: ${signal.message}`);
    }
  }
}
