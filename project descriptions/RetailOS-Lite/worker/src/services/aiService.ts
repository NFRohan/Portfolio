import { z } from "zod";
import type { AnalyzeShelfRequest, AnalyzeShelfResponse } from "../types/ai.js";
import type { VisitReportRecord } from "../types/domain.js";
import { logError, logInfo } from "../observability/logger.js";
import { observeStage } from "../observability/metrics.js";
import { captureWorkerException } from "../observability/sentry.js";

const analyzeShelfResponseSchema = z.object({
  visitId: z.string().nullable().optional(),
  yolo: z.object({
    modelName: z.string(),
    modelVersion: z.string(),
    analysisSource: z.string(),
    counts: z.object({
      olympic: z.number(),
      competitor: z.number(),
      total: z.number(),
    }),
    metrics: z.object({
      countRatio: z.number(),
      visibilityRatio: z.number(),
      olympicAreaRatio: z.number(),
      competitorAreaRatio: z.number(),
    }),
    detections: z.array(z.unknown()),
    overlayImageUrl: z.string().nullable().optional(),
  }),
  llm: z.unknown().nullable(),
  compliance: z.object({
    score: z.number(),
    status: z.string(),
    reasons: z.array(z.string()),
    recommendedAction: z.string(),
  }),
  supervisorSummary: z.string(),
});

const indexVisitReportResponseSchema = z.object({
  status: z.string(),
  vectorId: z.string(),
  namespace: z.string(),
  embeddingModel: z.string(),
});

export class AIServiceClient {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey?: string,
  ) {}

  async analyzeShelf(
    request: AnalyzeShelfRequest,
    telemetry: { correlationId?: string; jobId?: string; outletId?: string } = {},
  ): Promise<AnalyzeShelfResponse> {
    const started = Date.now();
    try {
      return await observeStage("yolo", async () => {
        const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/analyze-shelf`, {
          method: "POST",
          headers: this.headers(telemetry.correlationId),
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`AI service failed (${response.status}): ${body}`);
        }

        const json = await response.json();
        analyzeShelfResponseSchema.parse(json);
        logInfo("ai shelf analysis completed", {
          ...telemetry,
          visitId: request.visitId,
          stage: "yolo",
          status: "success",
          latencyMs: Date.now() - started,
        });
        return json as AnalyzeShelfResponse;
      });
    } catch (error) {
      logError(error, "ai shelf analysis failed", {
        ...telemetry,
        visitId: request.visitId,
        stage: "yolo",
        status: "error",
        latencyMs: Date.now() - started,
      });
      captureWorkerException(error, {
        ...telemetry,
        visitId: request.visitId,
        stage: "yolo",
      });
      throw error;
    }
  }

  async indexVisitReport(
    report: VisitReportRecord,
    telemetry: { correlationId?: string; jobId?: string } = {},
  ): Promise<void> {
    const started = Date.now();
    try {
      await observeStage("embedding", async () => {
        const response = await fetch(`${this.baseUrl.replace(/\/$/, "")}/rag/index-report`, {
          method: "POST",
          headers: this.headers(telemetry.correlationId),
          body: JSON.stringify(report),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`AI report indexing failed (${response.status}): ${body}`);
        }

        const json = await response.json();
        indexVisitReportResponseSchema.parse(json);
      });
      logInfo("visit report indexed", {
        ...telemetry,
        visitId: report.visitId,
        outletId: report.outletId,
        stage: "embedding",
        status: "success",
        latencyMs: Date.now() - started,
      });
    } catch (error) {
      logError(error, "visit report indexing failed", {
        ...telemetry,
        visitId: report.visitId,
        outletId: report.outletId,
        stage: "embedding",
        status: "error",
        latencyMs: Date.now() - started,
      });
      captureWorkerException(error, {
        ...telemetry,
        visitId: report.visitId,
        outletId: report.outletId,
        stage: "embedding",
      });
      throw error;
    }
  }

  private headers(correlationId?: string): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(correlationId ? { "x-correlation-id": correlationId, "x-request-id": correlationId } : {}),
      ...(this.apiKey ? { "x-api-key": this.apiKey } : {}),
    };
  }
}
