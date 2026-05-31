import pino from "pino";
import fs from "node:fs";
import path from "node:path";
import { config } from "../config.js";

export type WorkerTelemetryFields = {
  correlationId?: string;
  visitId?: string;
  outletId?: string;
  jobId?: string;
  stage?: string;
  latencyMs?: number;
  status?: string;
  [key: string]: unknown;
};

const streams: pino.StreamEntry[] = [{ stream: process.stdout }];
if (process.env.LOG_TO_FILE === "true") {
  const logDir = path.join(config.rootDir, process.env.LOG_DIR || "logs");
  fs.mkdirSync(logDir, { recursive: true });
  streams.push({ stream: pino.destination({ dest: path.join(logDir, "worker.log"), sync: false }) });
}

export const logger = pino(
  {
  level: process.env.LOG_LEVEL || "info",
  base: {
    service: "worker",
    environment: config.appEnv,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: "message",
  },
  pino.multistream(streams),
);

export function logInfo(message: string, fields: WorkerTelemetryFields = {}) {
  logger.info(clean(fields), message);
}

export function logWarn(message: string, fields: WorkerTelemetryFields = {}) {
  logger.warn(clean(fields), message);
}

export function logError(error: unknown, message: string, fields: WorkerTelemetryFields = {}) {
  logger.error(
    clean({
      ...fields,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
    message,
  );
}

function clean(fields: WorkerTelemetryFields): WorkerTelemetryFields {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null));
}
