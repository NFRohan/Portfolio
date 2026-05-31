import fs from "node:fs/promises";
import path from "node:path";
import type {
  AIResultRecord,
  EventLogRecord,
  FraudSignal,
  Visit,
  VisitImage,
  VisitReportRecord,
  VisitStatus,
} from "../types/domain.js";
import type { VisitRepository } from "./visitRepository.js";

type JsonDb = {
  visits: Visit[];
  aiResults: AIResultRecord[];
  fraudSignals: FraudSignal[];
  visitReports: VisitReportRecord[];
  eventLog: EventLogRecord[];
};

const emptyDb = (): JsonDb => ({
  visits: [],
  aiResults: [],
  fraudSignals: [],
  visitReports: [],
  eventLog: [],
});

export class JsonVisitRepository implements VisitRepository {
  constructor(private readonly filePath: string) {}

  async getVisitForAnalysis(visitId: string): Promise<Visit> {
    const db = await this.read();
    const visit = db.visits.find((candidate) => candidate.id === visitId);
    if (!visit) {
      throw new Error(`Visit not found: ${visitId}`);
    }
    if (visit.images.length === 0) {
      throw new Error(`Visit has no images: ${visitId}`);
    }
    return visit;
  }

  async updateVisitStatus(visitId: string, status: VisitStatus): Promise<void> {
    await this.mutate((db) => {
      const visit = db.visits.find((candidate) => candidate.id === visitId);
      if (!visit) throw new Error(`Visit not found: ${visitId}`);
      visit.status = status;
    });
  }

  async updateVisitImage(image: VisitImage): Promise<void> {
    await this.mutate((db) => {
      const visit = db.visits.find((candidate) => candidate.id === image.visitId);
      if (!visit) throw new Error(`Visit not found: ${image.visitId}`);
      const index = visit.images.findIndex((candidate) => candidate.id === image.id);
      if (index === -1) throw new Error(`Visit image not found: ${image.id}`);
      visit.images[index] = image;
    });
  }

  async findImagesByHash(imageHash: string, excludeVisitId: string): Promise<VisitImage[]> {
    const db = await this.read();
    return db.visits.flatMap((visit) =>
      visit.id === excludeVisitId
        ? []
        : visit.images.filter((image) => image.imageHash === imageHash),
    );
  }

  async findImagesWithPerceptualHash(excludeVisitId: string): Promise<VisitImage[]> {
    const db = await this.read();
    return db.visits.flatMap((visit) =>
      visit.id === excludeVisitId
        ? []
        : visit.images.filter((image) => typeof perceptualHashFromMetadata(image.metadata) === "string"),
    );
  }

  async saveFraudSignals(signals: FraudSignal[]): Promise<void> {
    await this.mutate((db) => {
      for (const signal of signals) {
        const exists = db.fraudSignals.some(
          (candidate) =>
            candidate.visitId === signal.visitId &&
            candidate.type === signal.type &&
            candidate.message === signal.message,
        );
        if (!exists) db.fraudSignals.push(signal);
      }
    });
  }

  async saveAIResult(result: AIResultRecord): Promise<void> {
    await this.mutate((db) => {
      db.aiResults = db.aiResults.filter((candidate) => candidate.visitId !== result.visitId);
      db.aiResults.push({
        ...result,
        outcomeSummary: outcomeSummaryForStorage(result.outcomeSummary),
      });
    });
  }

  async saveVisitReport(report: VisitReportRecord): Promise<void> {
    await this.mutate((db) => {
      db.visitReports = db.visitReports.filter((candidate) => candidate.visitId !== report.visitId);
      db.visitReports.push(report);
    });
  }

  async getVisitReport(visitId: string): Promise<VisitReportRecord> {
    const db = await this.read();
    const report = db.visitReports.find((candidate) => candidate.visitId === visitId);
    if (!report) throw new Error(`Visit report not found: ${visitId}`);
    return report;
  }

  async addEvent(event: EventLogRecord): Promise<void> {
    await this.mutate((db) => {
      db.eventLog.push(event);
    });
  }

  async hasVisitEvent(visitId: string, event: string): Promise<boolean> {
    const db = await this.read();
    return db.eventLog.some((entry) => entry.visitId === visitId && entry.event === event);
  }

  private async read(): Promise<JsonDb> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      return JSON.parse(raw) as JsonDb;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return emptyDb();
      }
      throw error;
    }
  }

  private async mutate(mutator: (db: JsonDb) => void): Promise<void> {
    const db = await this.read();
    mutator(db);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, `${JSON.stringify(db, null, 2)}\n`);
  }
}

function perceptualHashFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
  const fraud = metadata?.fraud;
  if (!fraud || typeof fraud !== "object") return null;
  const value = (fraud as { perceptualHash?: unknown }).perceptualHash;
  return typeof value === "string" ? value : null;
}

function outcomeSummaryForStorage(summary: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!summary) return undefined;
  const summaryWithoutFraudSignals = { ...summary };
  delete summaryWithoutFraudSignals.fraudSignals;
  return summaryWithoutFraudSignals;
}
