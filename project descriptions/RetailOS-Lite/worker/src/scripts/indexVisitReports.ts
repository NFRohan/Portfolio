import { PrismaClient } from "@prisma/client";
import fs from "node:fs/promises";
import { config } from "../config.js";
import { AIServiceClient } from "../services/aiService.js";
import type { VisitReportRecord } from "../types/domain.js";

async function main() {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has("--dry-run");
  const limit = readLimit(process.argv.slice(2));
  const aiService = new AIServiceClient(config.aiServiceUrl, config.aiServiceApiKey);
  const prisma = process.env.DATABASE_URL ? new PrismaClient() : null;

  try {
    const reports = prisma ? await loadPrismaReports(prisma, limit) : await loadJsonReports(limit);

    console.log(
      JSON.stringify({
        event: "visit_report_index_backfill_started",
        dryRun,
        limit,
        reportCount: reports.length,
        source: prisma ? "postgres" : "json",
      }),
    );

    for (const report of reports) {
      if (!dryRun) {
        await aiService.indexVisitReport(report);
        if (prisma) {
          await prisma.eventLog.create({
            data: {
              visitId: report.visitId,
              event: "VISIT_REPORT_INDEXED_BACKFILL",
              level: "info",
              actorType: "system",
              metadata: {
                vectorId: `visit-report:${report.visitId}`,
              },
            },
          });
        }
      }

      console.log(
        JSON.stringify({
          event: dryRun ? "visit_report_index_backfill_dry_run" : "visit_report_indexed_backfill",
          visitId: report.visitId,
          outletId: report.outletId,
        }),
      );
    }
  } finally {
    await prisma?.$disconnect();
  }
}

async function loadPrismaReports(prisma: PrismaClient, limit: number): Promise<VisitReportRecord[]> {
  const reports = await prisma.visitReport.findMany({
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return reports.map((report) => ({
    visitId: report.visitId,
    outletId: report.outletId,
    title: report.title,
    summary: report.summary,
    retrievalText: report.retrievalText,
    facts: report.facts as Record<string, unknown>,
    createdAt: report.createdAt.toISOString(),
  }));
}

async function loadJsonReports(limit: number): Promise<VisitReportRecord[]> {
  const raw = await fs.readFile(config.localDbPath, "utf8");
  const db = JSON.parse(raw) as { visitReports?: VisitReportRecord[] };
  return [...(db.visitReports ?? [])]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

function readLimit(args: string[]): number {
  const raw = args.find((arg) => arg.startsWith("--limit="))?.split("=", 2)[1];
  const parsed = raw ? Number(raw) : 100;
  if (!Number.isFinite(parsed) || parsed < 1) return 100;
  return Math.min(1000, Math.trunc(parsed));
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      event: "visit_report_index_backfill_failed",
      error: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
