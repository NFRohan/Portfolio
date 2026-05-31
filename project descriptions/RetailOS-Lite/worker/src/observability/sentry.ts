import * as Sentry from "@sentry/node";
import { config } from "../config.js";

Sentry.init({
  dsn: config.sentryDsn,
  enabled: Boolean(config.sentryDsn),
  environment: config.appEnv,
  release: config.sentryRelease,
  tracesSampleRate: config.sentryTracesSampleRate,
  sendDefaultPii: false,
  beforeSend(event) {
    event.tags = {
      service: "worker",
      ...event.tags,
    };
    return event;
  },
});

export { Sentry };

export function captureWorkerException(
  error: unknown,
  context: {
    stage: string;
    visitId?: string;
    outletId?: string;
    jobId?: string;
    correlationId?: string;
    extra?: Record<string, unknown>;
  },
) {
  Sentry.withScope((scope) => {
    scope.setTag("service", "worker");
    scope.setTag("stage", context.stage);
    if (context.visitId) scope.setTag("visit_id", context.visitId);
    if (context.outletId) scope.setTag("outlet_id", context.outletId);
    if (context.jobId) scope.setTag("job_id", context.jobId);
    if (context.correlationId) scope.setTag("correlation_id", context.correlationId);
    if (context.extra) scope.setContext("retailos", context.extra);
    Sentry.captureException(error);
  });
}
