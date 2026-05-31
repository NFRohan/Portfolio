import type {
  AIResultRecord,
  EventLogRecord,
  FraudSignal,
  Visit,
  VisitImage,
  VisitReportRecord,
  VisitStatus,
} from "../types/domain.js";

export type VisitRepository = {
  getVisitForAnalysis(visitId: string): Promise<Visit>;
  updateVisitStatus(visitId: string, status: VisitStatus): Promise<void>;
  updateVisitImage(image: VisitImage): Promise<void>;
  findImagesByHash(imageHash: string, excludeVisitId: string): Promise<VisitImage[]>;
  findImagesWithPerceptualHash(excludeVisitId: string): Promise<VisitImage[]>;
  saveFraudSignals(signals: FraudSignal[]): Promise<void>;
  saveAIResult(result: AIResultRecord): Promise<void>;
  saveVisitReport(report: VisitReportRecord): Promise<void>;
  getVisitReport(visitId: string): Promise<VisitReportRecord>;
  addEvent(event: EventLogRecord): Promise<void>;
  hasVisitEvent(visitId: string, event: string): Promise<boolean>;
};
