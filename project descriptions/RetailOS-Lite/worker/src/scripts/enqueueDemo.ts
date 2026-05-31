import { createAnalyzeVisitQueue, createRedisConnection } from "../queue.js";

const connection = createRedisConnection();
const queue = createAnalyzeVisitQueue(connection);

const job = await queue.add(
  "analyze_visit",
  {
    visitId: process.argv[2] ?? "visit_demo_001",
    traceId: `trace_${Date.now()}`,
    useLlm: process.env.WORKER_USE_LLM !== "false",
  },
  {
    attempts: 3,
    backoff: { type: "exponential", delay: 2000 },
    jobId: `analyze-${process.argv[2] ?? "visit_demo_001"}`,
    removeOnComplete: 100,
    removeOnFail: 100,
  },
);

console.log(JSON.stringify({ event: "demo_job_enqueued", jobId: job.id, visitId: job.data.visitId }));

await queue.close();
await connection.quit();
