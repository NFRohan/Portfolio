import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

dotenv.config({ path: path.join(rootDir, ".env") });
dotenv.config({ path: path.join(rootDir, "worker", ".env") });

function env(name: string, fallback: string): string {
  const raw = process.env[name];
  return raw && raw.trim() ? raw : fallback;
}

function optionalEnv(...names: string[]): string | undefined {
  for (const name of names) {
    const raw = process.env[name];
    if (raw && raw.trim()) return raw.trim();
  }
  return undefined;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const config = {
  rootDir,
  aiServiceUrl: env("AI_SERVICE_URL", "http://127.0.0.1:8001"),
  aiServiceApiKey: optionalEnv("RETAILOS_AI_SERVICE_API_KEY", "AI_SERVICE_API_KEY"),
  redisUrl: env("REDIS_URL", "redis://127.0.0.1:6379"),
  analyzeVisitQueueName: env("ANALYZE_VISIT_QUEUE", "analyze_visit"),
  analyzeVisitDeadLetterQueueName: env("ANALYZE_VISIT_DLQ", "analyze_visit_dlq"),
  embedVisitReportQueueName: env("EMBED_VISIT_REPORT_QUEUE", "embed_visit_report"),
  embedVisitReportDeadLetterQueueName: env("EMBED_VISIT_REPORT_DLQ", "embed_visit_report_dlq"),
  workerMetricsPort: envNumber("WORKER_METRICS_PORT", 9101),
  appEnv: env("APP_ENV", process.env.NODE_ENV || "development"),
  sentryDsn: optionalEnv("SENTRY_DSN"),
  sentryRelease: optionalEnv("SENTRY_RELEASE"),
  sentryTracesSampleRate: envNumber("SENTRY_TRACES_SAMPLE_RATE", 0.1),
  workerConcurrency: envNumber("WORKER_CONCURRENCY", 2),
  localDbPath: env("WORKER_LOCAL_DB_PATH", path.join(rootDir, "worker", "data", "db.json")),
  usePrisma: env("WORKER_USE_PRISMA", "true").toLowerCase() !== "false",
  defaultLlmEnabled: env("WORKER_USE_LLM", "true").toLowerCase() !== "false",
  fraudGpsThresholdMeters: envNumber("FRAUD_GPS_THRESHOLD_METERS", 200),
  fraudTimestampDelayHours: envNumber("FRAUD_TIMESTAMP_DELAY_HOURS", 6),
  fraudExifGpsThresholdMeters: envNumber("FRAUD_EXIF_GPS_THRESHOLD_METERS", 300),
  fraudExifTimestampDriftHours: envNumber("FRAUD_EXIF_TIMESTAMP_DRIFT_HOURS", 24),
};

export function validateWorkerConfig(): void {
  const errors: string[] = [];

  if (!config.aiServiceUrl.startsWith("http://") && !config.aiServiceUrl.startsWith("https://")) {
    errors.push("AI_SERVICE_URL must be an http(s) URL.");
  }
  if (!config.redisUrl.startsWith("redis://") && !config.redisUrl.startsWith("rediss://")) {
    errors.push("REDIS_URL must be a redis:// or rediss:// URL.");
  }
  if (config.workerConcurrency < 1) {
    errors.push("WORKER_CONCURRENCY must be at least 1.");
  }

  if (errors.length > 0) {
    throw new Error(`Invalid worker configuration: ${errors.join(" ")}`);
  }
}
