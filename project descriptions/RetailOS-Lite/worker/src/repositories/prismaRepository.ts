import { Prisma, type PrismaClient } from "@prisma/client";
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

export class PrismaVisitRepository implements VisitRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async getVisitForAnalysis(visitId: string): Promise<Visit> {
    const visit = await this.prisma.visit.findUnique({
      where: { id: visitId },
      include: { outlet: true, images: true, rep: { select: { name: true } } },
    });
    if (!visit) throw new Error(`Visit not found: ${visitId}`);
    if (visit.images.length === 0) throw new Error(`Visit has no images: ${visitId}`);

    return {
      id: visit.id,
      outletId: visit.outletId,
      repId: visit.repId,
      status: visit.status as VisitStatus,
      checkInLat: visit.checkInLat ?? undefined,
      checkInLng: visit.checkInLng ?? undefined,
      clientTimestamp: visit.clientTimestamp?.toISOString(),
      serverCreatedAt: visit.createdAt.toISOString(),
      notes: visit.notes ?? undefined,
      repName: visit.rep.name,
      outlet: {
        id: visit.outlet.id,
        name: visit.outlet.name,
        code: visit.outlet.code,
        latitude: visit.outlet.latitude ?? undefined,
        longitude: visit.outlet.longitude ?? undefined,
      },
      images: visit.images.map((img) => ({
        id: img.id,
        visitId: img.visitId,
        url: img.url,
        localPath: img.localPath ?? undefined,
        imageHash: img.imageHash ?? undefined,
        metadata: img.metadata as Record<string, unknown> | undefined,
      })),
    };
  }

  async updateVisitStatus(visitId: string, status: VisitStatus): Promise<void> {
    await this.prisma.visit.update({ where: { id: visitId }, data: { status } });
  }

  async updateVisitImage(image: VisitImage): Promise<void> {
    await this.prisma.visitImage.update({
      where: { id: image.id },
      data: {
        imageHash: image.imageHash,
        metadata: jsonOrUndefined(image.metadata),
      },
    });
  }

  async findImagesByHash(imageHash: string, excludeVisitId: string): Promise<VisitImage[]> {
    const images = await this.prisma.visitImage.findMany({
      where: {
        imageHash,
        visitId: { not: excludeVisitId },
      },
    });
    return images.map((img) => ({
      id: img.id,
      visitId: img.visitId,
      url: img.url,
      localPath: img.localPath ?? undefined,
      imageHash: img.imageHash ?? undefined,
    }));
  }

  async findImagesWithPerceptualHash(excludeVisitId: string): Promise<VisitImage[]> {
    const images = await this.prisma.visitImage.findMany({
      where: {
        visitId: { not: excludeVisitId },
        metadata: { not: Prisma.JsonNull },
      },
    });
    return images
      .map((img) => ({
        id: img.id,
        visitId: img.visitId,
        url: img.url,
        localPath: img.localPath ?? undefined,
        imageHash: img.imageHash ?? undefined,
        metadata: img.metadata as Record<string, unknown> | undefined,
      }))
      .filter((image) => typeof perceptualHashFromMetadata(image.metadata) === "string");
  }

  async saveFraudSignals(signals: FraudSignal[]): Promise<void> {
    for (const signal of signals) {
      const existing = await this.prisma.fraudSignal.findFirst({
        where: {
          visitId: signal.visitId,
          type: signal.type,
          message: signal.message,
        },
      });
      if (!existing) {
        await this.prisma.fraudSignal.create({
          data: {
            visitId: signal.visitId,
            type: signal.type,
            severity: signal.severity,
            message: signal.message,
            metadata: jsonOrUndefined(signal.metadata),
            createdAt: new Date(signal.createdAt),
          },
        });
      }
    }
  }

  async saveAIResult(result: AIResultRecord): Promise<void> {
    const storedOutcomeSummary = outcomeSummaryForStorage(result.outcomeSummary);

    await this.prisma.aIResult.upsert({
      where: { visitId: result.visitId },
      create: {
        visitId: result.visitId,
        analysisSource: result.analysisSource,
        detectorModel: result.detectorModel,
        detectorVersion: result.detectorVersion,
        complianceScore: result.complianceScore,
        status: result.status,
        supervisorSummary: result.supervisorSummary,
        yoloDetections: jsonOrUndefined(result.yoloDetections),
        detectedProducts: jsonValue(result.detectedProducts),
        competitors: jsonValue(result.competitors),
        posm: jsonOrUndefined(result.posm),
        overlayImageUrl: result.overlayImageUrl,
        outcomeSummary: jsonOrUndefined(storedOutcomeSummary),
        rawModelOutput: jsonValue(result.rawModelOutput),
        createdAt: new Date(result.createdAt),
      },
      update: {
        analysisSource: result.analysisSource,
        detectorModel: result.detectorModel,
        detectorVersion: result.detectorVersion,
        complianceScore: result.complianceScore,
        status: result.status,
        supervisorSummary: result.supervisorSummary,
        yoloDetections: jsonOrUndefined(result.yoloDetections),
        detectedProducts: jsonValue(result.detectedProducts),
        competitors: jsonValue(result.competitors),
        posm: jsonOrUndefined(result.posm),
        overlayImageUrl: result.overlayImageUrl,
        outcomeSummary: jsonOrUndefined(storedOutcomeSummary),
        rawModelOutput: jsonValue(result.rawModelOutput),
      },
    });
  }

  async saveVisitReport(report: VisitReportRecord): Promise<void> {
    await this.prisma.visitReport.upsert({
      where: { visitId: report.visitId },
      create: {
        visitId: report.visitId,
        outletId: report.outletId,
        title: report.title,
        summary: report.summary,
        retrievalText: report.retrievalText,
        facts: jsonValue(report.facts),
        createdAt: new Date(report.createdAt),
      },
      update: {
        outletId: report.outletId,
        title: report.title,
        summary: report.summary,
        retrievalText: report.retrievalText,
        facts: jsonValue(report.facts),
      },
    });
  }

  async getVisitReport(visitId: string): Promise<VisitReportRecord> {
    const report = await this.prisma.visitReport.findUnique({
      where: { visitId },
    });
    if (!report) throw new Error(`Visit report not found: ${visitId}`);
    return {
      visitId: report.visitId,
      outletId: report.outletId,
      title: report.title,
      summary: report.summary,
      retrievalText: report.retrievalText,
      facts: report.facts as Record<string, unknown>,
      createdAt: report.createdAt.toISOString(),
    };
  }

  async addEvent(event: EventLogRecord): Promise<void> {
    await this.prisma.eventLog.create({
      data: {
        visitId: event.visitId,
        jobId: event.jobId,
        event: event.event,
        level: event.level,
        traceId: event.traceId,
        actorId: event.actorId,
        actorRole: event.actorRole,
        actorType: event.actorType ?? "worker",
        metadata: jsonOrUndefined(event.metadata),
        createdAt: new Date(event.createdAt),
      },
    });
  }

  async hasVisitEvent(visitId: string, event: string): Promise<boolean> {
    const count = await this.prisma.eventLog.count({
      where: { visitId, event },
    });
    return count > 0;
  }
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function jsonOrUndefined(value: unknown): Prisma.InputJsonValue | undefined {
  return value === undefined || value === null ? undefined : jsonValue(value);
}

function outcomeSummaryForStorage(summary: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!summary) return undefined;
  const summaryWithoutFraudSignals = { ...summary };
  delete summaryWithoutFraudSignals.fraudSignals;
  return summaryWithoutFraudSignals;
}

function perceptualHashFromMetadata(metadata: Record<string, unknown> | undefined): string | null {
  const fraud = metadata?.fraud;
  if (!fraud || typeof fraud !== "object") return null;
  const value = (fraud as { perceptualHash?: unknown }).perceptualHash;
  return typeof value === "string" ? value : null;
}
