import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type AssistantContextItem = {
  visitId: string;
  outletId: string | null;
  outletName: string;
  visitDate: string | null;
  complianceScore: number | null;
  complianceStatus: string | null;
  riskStatus: "SAFE" | "REVIEW_NEEDED" | "HIGH_RISK";
  fraudCount: number;
  missingPosm: boolean | null;
  summary: string;
  retrievalText: string;
};

export type AssistantCitation = {
  visitId: string;
  outletName: string;
  reason: string;
};

export type AssistantMatch = {
  visitId: string;
  outletId?: string | null;
  outletName: string;
  score?: number | null;
  summary: string;
};

export type AssistantAnswer = {
  answer: string;
  citations: AssistantCitation[];
  matches: AssistantMatch[];
  model: string;
  embeddingModel: string;
  retrievalMode: string;
  warnings: string[];
  exactContextCount: number;
};

type VisitReportWithVisit = Prisma.VisitReportGetPayload<{
  include: {
    visit: {
      include: {
        outlet: true;
        aiResult: true;
        fraudSignals: true;
      };
    };
  };
}>;

export async function buildAssistantExactContext(question: string): Promise<AssistantContextItem[]> {
  const reports = await prisma.visitReport.findMany({
    include: {
      visit: {
        include: {
          outlet: true,
          aiResult: true,
          fraudSignals: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  const normalizedQuestion = normalize(question);
  const intents = detectIntents(normalizedQuestion);
  const selected = new Map<string, VisitReportWithVisit>();

  function addMatches(predicate: (report: VisitReportWithVisit) => boolean, limit = 25) {
    for (const report of reports) {
      if (selected.size >= 30) break;
      if (selected.has(report.visitId)) continue;
      if (predicate(report)) selected.set(report.visitId, report);
      if (selected.size >= limit) break;
    }
  }

  addMatches((report) => questionMentionsOutlet(normalizedQuestion, report.visit.outlet.name), 30);
  if (intents.compliance) addMatches((report) => isFailingCompliance(report), 30);
  if (intents.posm) addMatches((report) => missingPosm(report) === true, 30);
  if (intents.fraud) addMatches((report) => actionableFraudSignals(report).length > 0, 30);
  if (intents.review) addMatches((report) => riskStatus(report) !== "SAFE", 30);

  if (isExactListQuestion(intents) && selected.size === 0) {
    return [];
  }

  if (selected.size === 0) {
    addMatches(() => true, 12);
  } else if (selected.size < 6 && !isExactListQuestion(intents)) {
    addMatches(() => true, 10);
  }

  return [...selected.values()].slice(0, 20).map(toAssistantContextItem);
}

export function exactNoMatchAssistantAnswer(question: string): AssistantAnswer | null {
  const intents = detectIntents(normalize(question));
  if (!isExactListQuestion(intents)) return null;

  const subject = intents.fraud
    ? "actionable fraud signals"
    : intents.posm
      ? "missing POSM"
      : intents.compliance
        ? "failing compliance"
        : "supervisor review reasons";

  return {
    answer: `No outlets currently match this exact database query for ${subject}.`,
    citations: [],
    matches: [],
    model: "exact-database",
    embeddingModel: "not-used",
    retrievalMode: "exact",
    warnings: [],
    exactContextCount: 0,
  };
}

export function fallbackAssistantAnswer(
  question: string,
  exactContext: AssistantContextItem[],
  warnings: string[] = [],
): AssistantAnswer {
  if (exactContext.length === 0) {
    return {
      answer: `I do not have enough visit report context to answer: ${question}`,
      citations: [],
      matches: [],
      model: "local-fallback",
      embeddingModel: "not-used",
      retrievalMode: "exact_fallback",
      warnings,
      exactContextCount: 0,
    };
  }

  const rows = exactContext.slice(0, 8).map((item) => {
    const score = item.complianceScore === null ? "unknown" : `${item.complianceScore}%`;
    return `${item.outletName} (${item.visitId}): compliance ${score}; ${item.summary}`;
  });

  return {
    answer: `From the matching visit reports: ${rows.join(" ")}`,
    citations: exactContext.slice(0, 8).map((item) => ({
      visitId: item.visitId,
      outletName: item.outletName,
      reason: "Exact database context",
    })),
    matches: [],
    model: "local-fallback",
    embeddingModel: "not-used",
    retrievalMode: "exact_fallback",
    warnings,
    exactContextCount: exactContext.length,
  };
}

function toAssistantContextItem(report: VisitReportWithVisit): AssistantContextItem {
  const complianceScore = scoreForReport(report);
  const complianceStatus = statusForReport(report);
  const signals = actionableFraudSignals(report);
  const posmMissing = missingPosm(report);

  return {
    visitId: report.visitId,
    outletId: report.outletId,
    outletName: report.visit.outlet.name,
    visitDate: report.visit.createdAt.toISOString(),
    complianceScore,
    complianceStatus,
    riskStatus: riskStatus(report),
    fraudCount: signals.length,
    missingPosm: posmMissing,
    summary: report.summary,
    retrievalText: report.retrievalText.slice(0, 6000),
  };
}

function detectIntents(normalizedQuestion: string) {
  return {
    compliance: includesAny(normalizedQuestion, [
      "compliance",
      "fail",
      "failing",
      "failed",
      "below",
      "critical",
      "low score",
      "non compliant",
      "noncompliant",
    ]),
    posm: includesAny(normalizedQuestion, ["posm", "poster", "wobbler", "shelf strip", "signage", "branding"]),
    fraud: includesAny(normalizedQuestion, ["fraud", "duplicate", "gps", "timestamp", "fake", "suspicious"]),
    review: includesAny(normalizedQuestion, ["review", "flagged", "risk", "attention", "problem"]),
  };
}

function isExactListQuestion(intents: ReturnType<typeof detectIntents>): boolean {
  return intents.compliance || intents.posm || intents.fraud || intents.review;
}

function isFailingCompliance(report: VisitReportWithVisit): boolean {
  const score = scoreForReport(report);
  const status = statusForReport(report);
  return (score !== null && score < 70) || status === "critical" || status === "warning";
}

function scoreForReport(report: VisitReportWithVisit): number | null {
  const aiScore = report.visit.aiResult?.complianceScore;
  if (typeof aiScore === "number") return aiScore;
  const factsScore = nestedNumber(report.facts, ["compliance", "score"]);
  return factsScore;
}

function statusForReport(report: VisitReportWithVisit): string | null {
  const aiStatus = report.visit.aiResult?.status;
  if (aiStatus) return aiStatus;
  return nestedString(report.facts, ["compliance", "status"]);
}

function missingPosm(report: VisitReportWithVisit): boolean | null {
  const aiPosm = jsonObject(report.visit.aiResult?.posm);
  const factsPosm = jsonObject(jsonObject(report.facts)?.posm);
  const detected = aiPosm?.detected ?? factsPosm?.detected;
  return typeof detected === "boolean" ? !detected : null;
}

function actionableFraudSignals(report: VisitReportWithVisit) {
  return report.visit.fraudSignals.filter((signal) => signal.type !== "IMAGE_HASHED");
}

function riskStatus(report: VisitReportWithVisit): AssistantContextItem["riskStatus"] {
  const score = scoreForReport(report);
  const signals = actionableFraudSignals(report);
  const highFraud = signals.some((signal) => signal.severity === "HIGH");
  if (highFraud || (score !== null && score < 50)) return "HIGH_RISK";
  if (signals.length > 0 || missingPosm(report) || (score !== null && score < 70)) {
    return "REVIEW_NEEDED";
  }
  return "SAFE";
}

function questionMentionsOutlet(normalizedQuestion: string, outletName: string): boolean {
  const normalizedOutlet = normalize(outletName);
  if (!normalizedOutlet) return false;
  if (normalizedQuestion.includes(normalizedOutlet)) return true;

  const outletTokens = new Set(normalizedOutlet.split(" ").filter((token) => token.length >= 3));
  if (outletTokens.size === 0) return false;
  const questionTokens = normalizedQuestion.split(" ");
  const overlap = questionTokens.filter((token) => outletTokens.has(token)).length;
  return overlap >= Math.min(2, outletTokens.size);
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function nestedNumber(value: unknown, path: string[]): number | null {
  const found = nestedValue(value, path);
  return typeof found === "number" ? found : null;
}

function nestedString(value: unknown, path: string[]): string | null {
  const found = nestedValue(value, path);
  return typeof found === "string" ? found : null;
}

function nestedValue(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    const object = jsonObject(current);
    if (!object) return null;
    current = object[segment];
  }
  return current;
}

function jsonObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}
