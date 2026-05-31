import type { VisitStatus } from "@prisma/client";

export type OutcomeSummary = {
  visitId: string;
  outletName: string;
  finalStatus: string;
  complianceScore: number;
  complianceStatus: string;
  complianceReasons: string[];
  supervisorSummary: string;
  recommendedAction: string;
  counts: { olympic: number; competitor: number; total: number };
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
  fraudSignals?: Array<{ type: string; severity: string; message: string }>;
};

export type VisitDetail = {
  id: string;
  status: VisitStatus;
  checkInLat: number | null;
  checkInLng: number | null;
  clientTimestamp: string | null;
  notes: string | null;
  createdAt: string;
  outlet: {
    id: string;
    name: string;
    code: string;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  rep: { id: string; name: string; email: string };
  images: Array<{
    id: string;
    url: string;
    localPath: string | null;
    imageHash: string | null;
  }>;
  aiResult: {
    complianceScore: number;
    status: string;
    supervisorSummary: string;
    overlayImageUrl: string | null;
    outcomeSummary: OutcomeSummary | null;
    yoloDetections: unknown;
  } | null;
  fraudSignals: Array<{
    id: string;
    type: string;
    severity: string;
    message: string;
  }>;
};

export type DashboardData = {
  visitsToday: number;
  avgComplianceScore: number;
  flaggedCount: number;
  outletsBelowThreshold: number;
  visits: VisitListItem[];
  needsAttention: VisitListItem[];
  recentVisits: VisitListItem[];
  summary: DashboardSummary;
  trend: DashboardTrendPoint[];
};

export type DashboardSummary = {
  rangeDays: number;
  timeZone: string;
  visitsToday: number;
  visitsDeltaPct: number;
  avgComplianceScore: number;
  previousAvgComplianceScore: number;
  avgComplianceDeltaPct: number;
  missingPosmCount: number;
  fraudDetectionCount: number;
  flaggedFraudCount: number;
  posmCompliancePct: number;
  posmComplianceDeltaPct: number;
  qualityScore: number;
  qualityDeltaPct: number;
};

export type DashboardTrendPoint = {
  date: string;
  visits: number;
  avgComplianceScore: number;
  posmCompliancePct: number;
  qualityScore: number;
  fraudDetections: number;
  missingPosm: number;
};

export type VisitListItem = {
  id: string;
  status: VisitStatus;
  createdAt: string;
  timestamp: string;
  outletName: string;
  outletCode: string;
  repName: string;
  complianceScore: number | null;
  complianceStatus: string | null;
  supervisorSummary: string | null;
  fraudCount: number;
  hasHighFraud: boolean;
  hasMissingPosm: boolean;
  reviewReasons: string[];
  riskStatus: "SAFE" | "REVIEW_NEEDED" | "HIGH_RISK";
};

export type VisitLogsResponse = {
  items: VisitListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  facets: {
    all: number;
    safe: number;
    flagged: number;
    reviewNeeded: number;
    highRisk: number;
  };
};

export const TERMINAL_STATUSES: VisitStatus[] = ["COMPLETE", "FLAGGED", "FAILED"];
