import type { Job } from "bullmq";
import { config } from "../config.js";
import type { AIServiceClient } from "../services/aiService.js";
import { runContextualFraudChecks } from "../services/fraud.js";
import { buildOutcomeSummary } from "../services/outcomeSummary.js";
import { buildVisitReport } from "../services/reportBuilder.js";
import { sendFraudAlert } from "../services/whatsappAlerts.js";
import type { AnalyzeShelfResponse } from "../types/ai.js";
import type { AnalyzeVisitJobData, AIResultRecord, Visit } from "../types/domain.js";
import type { VisitRepository } from "../repositories/visitRepository.js";
import { logError, logInfo } from "../observability/logger.js";
import { fraudSignals as fraudSignalMetric, observeStage } from "../observability/metrics.js";
import { captureWorkerException } from "../observability/sentry.js";

type AnalyzeVisitDeps = {
  repository: VisitRepository;
  aiService: AIServiceClient;
  enqueueVisitReport?: (visitId: string) => Promise<void>;
};

const nowIso = () => new Date().toISOString();

export async function analyzeVisit(
  jobData: AnalyzeVisitJobData,
  deps: AnalyzeVisitDeps,
  job?: Job<AnalyzeVisitJobData>,
): Promise<AIResultRecord> {
  const { repository, aiService } = deps;
  const startedAt = Date.now();
  const correlationId = jobData.traceId;

  await repository.addEvent({
    visitId: jobData.visitId,
    jobId: job?.id,
    event: "ANALYZE_VISIT_STARTED",
    level: "info",
    traceId: jobData.traceId,
    metadata: { queue: job?.queueName },
    createdAt: nowIso(),
  });

  await repository.updateVisitStatus(jobData.visitId, "ANALYZING");

  try {
    const visit = await repository.getVisitForAnalysis(jobData.visitId);
    const primaryImage = selectPrimaryImage(visit);
    logInfo("analyze visit started", {
      correlationId,
      visitId: visit.id,
      outletId: visit.outletId,
      jobId: job?.id,
      stage: "analyze_visit",
      status: "started",
    });
    const fraudSignals = await observeStage("fraud", async () => runContextualFraudChecks(visit, repository));
    for (const signal of fraudSignals) {
      fraudSignalMetric.labels(signal.type, signal.severity).inc();
    }
    await repository.addEvent({
      visitId: visit.id,
      jobId: job?.id,
      event: "FRAUD_CHECKS_COMPLETED",
      level: fraudSignals.length > 0 ? "warn" : "info",
      traceId: correlationId,
      metadata: {
        fraudSignalCount: fraudSignals.length,
        signals: fraudSignals.map((signal) => ({
          type: signal.type,
          severity: signal.severity,
          message: signal.message,
        })),
      },
      createdAt: nowIso(),
    });

    const analysis = await aiService.analyzeShelf(
      {
        visitId: visit.id,
        imagePath: primaryImage.localPath,
        imageUrl: serverUrlForImage(primaryImage) ?? primaryImage.url,
        saveOverlay: true,
        useLlm: jobData.useLlm ?? config.defaultLlmEnabled,
        outletName: visit.outlet.name,
        repNotes: visit.notes,
      },
      { correlationId, jobId: job?.id, outletId: visit.outletId },
    );

    const aiResult = toAIResult(visit, analysis);
    const highSeverityFraud = fraudSignals.some((signal) => signal.severity === "HIGH");
    const finalStatus = highSeverityFraud || analysis.compliance.status === "critical" ? "FLAGGED" : "COMPLETE";
    const outcomeSummary = buildOutcomeSummary(visit, analysis, fraudSignals, finalStatus);
    const report = await observeStage("report", async () => buildVisitReport(visit, analysis, fraudSignals));
    aiResult.outcomeSummary = outcomeSummary;

    await repository.saveFraudSignals(fraudSignals);
    await repository.saveAIResult(aiResult);
    await repository.saveVisitReport(report);
    await repository.updateVisitStatus(visit.id, finalStatus);

    await repository.addEvent({
      visitId: visit.id,
      jobId: job?.id,
      event: "VISIT_REPORT_GENERATED",
      level: "info",
      traceId: correlationId,
      metadata: {
        complianceScore: analysis.compliance.score,
        reportTitle: report.title,
      },
      createdAt: nowIso(),
    });

    if (deps.enqueueVisitReport) {
      await deps.enqueueVisitReport(visit.id);
    }

    await repository.addEvent({
      visitId: visit.id,
      jobId: job?.id,
      event: "ANALYZE_VISIT_COMPLETED",
      level: "info",
      traceId: jobData.traceId,
      metadata: {
        durationMs: Date.now() - startedAt,
        complianceScore: analysis.compliance.score,
        finalStatus,
        fraudSignalCount: fraudSignals.length,
        analysisSource: analysis.yolo.analysisSource,
        outcomeSummary,
      },
      createdAt: nowIso(),
    });

    logInfo("analyze visit completed", {
      correlationId,
      visitId: visit.id,
      outletId: visit.outletId,
      jobId: job?.id,
      stage: "analyze_visit",
      status: finalStatus,
      latencyMs: Date.now() - startedAt,
      complianceScore: analysis.compliance.score,
      fraudSignalCount: fraudSignals.length,
    });

    if (fraudSignals.length > 0) {
      const alertAlreadySent = await repository.hasVisitEvent(visit.id, "WHATSAPP_FRAUD_ALERT_SENT");
      if (alertAlreadySent) {
        console.info("[fraud-whatsapp-alerts] Skipped: alert already sent for visit", { visitId: visit.id });
      } else {
        const alertResult = await sendFraudAlert({
          visitId: visit.id,
          storeName: visit.outlet.name,
          repName: visit.repName ?? "Unknown rep",
          complianceScore: analysis.compliance.score,
          complianceStatus: analysis.compliance.status,
          fraudSignals,
        });

        if (alertResult.ok) {
          await repository.addEvent({
            visitId: visit.id,
            jobId: job?.id,
            event: "WHATSAPP_FRAUD_ALERT_SENT",
            level: "info",
            traceId: correlationId,
            metadata: { messageSid: alertResult.messageSid },
            createdAt: nowIso(),
          });
          logInfo("fraud whatsapp alert sent", {
            correlationId,
            visitId: visit.id,
            messageSid: alertResult.messageSid,
            stage: "whatsapp_alert",
            status: "sent",
          });
        } else {
          logError(new Error(alertResult.error ?? "WhatsApp send failed"), "fraud whatsapp alert failed", {
            correlationId,
            visitId: visit.id,
            stage: "whatsapp_alert",
            status: "failed",
          });
        }
      }
    }

    return aiResult;
  } catch (error) {
    logError(error, "analyze visit failed", {
      correlationId,
      visitId: jobData.visitId,
      jobId: job?.id,
      stage: "analyze_visit",
      status: "error",
      latencyMs: Date.now() - startedAt,
    });
    captureWorkerException(error, {
      correlationId,
      visitId: jobData.visitId,
      jobId: job?.id,
      stage: "analyze_visit",
    });
    await repository.updateVisitStatus(jobData.visitId, "FAILED").catch(() => undefined);
    await repository.addEvent({
      visitId: jobData.visitId,
      jobId: job?.id,
      event: "ANALYZE_VISIT_FAILED",
      level: "error",
      traceId: jobData.traceId,
      metadata: {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      },
      createdAt: nowIso(),
    });
    throw error;
  }
}

function selectPrimaryImage(visit: Visit) {
  const image = visit.images[0];
  if (!image.localPath && !image.url) {
    throw new Error(`Primary image has neither localPath nor url for visit ${visit.id}`);
  }
  return image;
}

function serverUrlForImage(image: { metadata?: Record<string, unknown> }): string | undefined {
  const value = image.metadata?.serverUrl;
  return typeof value === "string" && value ? value : undefined;
}

function toAIResult(visit: Visit, analysis: AnalyzeShelfResponse): AIResultRecord {
  return {
    visitId: visit.id,
    analysisSource: analysis.yolo.analysisSource,
    detectorModel: analysis.yolo.modelName,
    detectorVersion: analysis.yolo.modelVersion,
    complianceScore: analysis.compliance.score,
    status: analysis.compliance.status,
    supervisorSummary: analysis.supervisorSummary,
    yoloDetections: analysis.yolo.detections,
    detectedProducts: {
      olympicCount: analysis.yolo.counts.olympic,
      visibilityRatio: analysis.yolo.metrics.visibilityRatio,
    },
    competitors: {
      competitorCount: analysis.yolo.counts.competitor,
      competitorAreaRatio: analysis.yolo.metrics.competitorAreaRatio,
    },
    posm: analysis.llm?.posm ?? null,
    overlayImageUrl: analysis.yolo.overlayImageUrl ?? null,
    rawModelOutput: analysis,
    createdAt: nowIso(),
  };
}
