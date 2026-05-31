export type VisitStatus = "PENDING" | "ANALYZING" | "COMPLETE" | "FLAGGED" | "FAILED";

export type FraudSeverity = "LOW" | "MEDIUM" | "HIGH";

export type FraudSignal = {
  visitId: string;
  type:
    | "DUPLICATE_IMAGE"
    | "GPS_MISMATCH"
    | "TIMESTAMP_ANOMALY"
    | "IMAGE_HASHED"
    | "PERCEPTUAL_DUPLICATE_IMAGE"
    | "EXIF_GPS_MISMATCH"
    | "EXIF_TIMESTAMP_ANOMALY";
  severity: FraudSeverity;
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type Outlet = {
  id: string;
  name: string;
  code?: string;
  latitude?: number;
  longitude?: number;
};

export type VisitImage = {
  id: string;
  visitId: string;
  url?: string;
  localPath?: string;
  imageHash?: string;
  metadata?: Record<string, unknown>;
};

export type Visit = {
  id: string;
  outletId: string;
  repId: string;
  status: VisitStatus;
  checkInLat?: number;
  checkInLng?: number;
  clientTimestamp?: string;
  serverCreatedAt?: string;
  notes?: string;
  repName?: string;
  outlet: Outlet;
  images: VisitImage[];
};

export type AnalyzeVisitJobData = {
  visitId: string;
  traceId?: string;
  useLlm?: boolean;
};

export type AIResultRecord = {
  visitId: string;
  analysisSource: string;
  detectorModel: string;
  detectorVersion: string;
  complianceScore: number;
  status: string;
  supervisorSummary: string;
  yoloDetections: unknown;
  detectedProducts: unknown;
  competitors: unknown;
  posm: unknown;
  overlayImageUrl?: string | null;
  rawModelOutput: unknown;
  outcomeSummary?: Record<string, unknown>;
  createdAt: string;
};

export type VisitReportRecord = {
  visitId: string;
  outletId: string;
  title: string;
  summary: string;
  retrievalText: string;
  facts: Record<string, unknown>;
  createdAt: string;
};

export type EventLogRecord = {
  visitId?: string;
  jobId?: string;
  event: string;
  level: "info" | "warn" | "error";
  traceId?: string;
  actorId?: string;
  actorRole?: string;
  actorType?: "system" | "worker" | "user";
  metadata?: Record<string, unknown>;
  createdAt: string;
};
