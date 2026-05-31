import { config } from "../config.js";
import { analyzeVisit } from "../jobs/analyzeVisit.js";
import { JsonVisitRepository } from "../repositories/jsonRepository.js";
import { AIServiceClient } from "../services/aiService.js";
import { printOutcomeSummary, type VisitAnalysisOutcomeSummary } from "../services/outcomeSummary.js";

const visitId = process.argv[2] ?? "visit_demo_001";
const repository = new JsonVisitRepository(config.localDbPath);
const aiService = new AIServiceClient(config.aiServiceUrl);

const result = await analyzeVisit(
  {
    visitId,
    traceId: `dry_run_${Date.now()}`,
    useLlm: process.env.WORKER_USE_LLM !== "false",
  },
  {
    repository,
    aiService,
  },
);

console.log(
  JSON.stringify(
    {
      event: "dry_run_completed",
      visitId,
      complianceScore: result.complianceScore,
      status: result.status,
      summary: result.supervisorSummary,
      analysisSource: result.analysisSource,
    },
    null,
    2,
  ),
);

if (result.outcomeSummary) {
  printOutcomeSummary(result.outcomeSummary as VisitAnalysisOutcomeSummary);
}
