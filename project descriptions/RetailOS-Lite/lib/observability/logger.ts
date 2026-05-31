import pino from "pino";
import fs from "node:fs";
import path from "node:path";

export type TelemetryFields = {
  correlationId?: string;
  visitId?: string;
  outletId?: string;
  jobId?: string;
  stage?: string;
  latencyMs?: number;
  status?: string;
  [key: string]: unknown;
};

const service = process.env.OTEL_SERVICE_NAME || "web";
const streams: pino.StreamEntry[] = [{ stream: process.stdout }];
if (process.env.LOG_TO_FILE === "true") {
  const logDir = path.join(process.cwd(), process.env.LOG_DIR || "logs");
  fs.mkdirSync(logDir, { recursive: true });
  streams.push({ stream: pino.destination({ dest: path.join(logDir, `${service}.log`), sync: false }) });
}

const logger = pino(
  {
  level: process.env.LOG_LEVEL || "info",
  base: {
    service,
    environment: process.env.APP_ENV || process.env.NODE_ENV || "development",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: "message",
  },
  pino.multistream(streams),
);

export function logInfo(message: string, fields: TelemetryFields = {}) {
  logger.info(cleanFields(fields), message);
}

export function logWarn(message: string, fields: TelemetryFields = {}) {
  logger.warn(cleanFields(fields), message);
}

export function logError(error: unknown, message: string, fields: TelemetryFields = {}) {
  logger.error(
    cleanFields({
      ...fields,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }),
    message,
  );
}

function cleanFields(fields: TelemetryFields): TelemetryFields {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null));
}
