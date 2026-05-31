"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock3,
  DatabaseZap,
  Gauge,
  RadioTower,
  Workflow,
} from "lucide-react";

type OpsData = {
  generatedAt: string;
  queueHealth: {
    status: string;
    error?: string;
    queues: Array<{
      name: string;
      counts: Record<string, number>;
      failedJobs: Array<{ id?: string; name: string; failedReason?: string; attemptsMade: number; data: unknown }>;
    }>;
  };
  workerHealth: { status: string; reason: string };
  recentEvents: OpsEvent[];
  failures: OpsEvent[];
  timelines: Array<{
    visitId: string;
    outletName: string;
    repName: string;
    visitStatus: string;
    complianceScore: number | null;
    fraudSignals: number;
    durationMs: number | null;
    events: OpsEvent[];
  }>;
  assistant: { recentQueries: number; lastEventAt: string | null };
  latency: {
    averageMs: number | null;
    sampleCount: number;
    byStage: Array<{
      stage: string;
      averageMs: number | null;
      sampleCount: number;
    }>;
  };
};

type OpsEvent = {
  id: string;
  visitId: string | null;
  jobId: string | null;
  outletName: string | null;
  event: string;
  level: string;
  stage: string;
  traceId: string | null;
  latencyMs: number | null;
  createdAt: string;
};

export default function SupervisorOpsPage() {
  const { data, isLoading } = useQuery<OpsData>({
    queryKey: ["ops"],
    queryFn: () => fetch("/api/ops").then((response) => response.json()),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-[1440px] space-y-6">
        <Skeleton className="h-24 rounded-xl bg-white" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => (
            <Skeleton key={item} className="h-32 rounded-xl bg-white" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl bg-white" />
      </div>
    );
  }

  const analyzeQueue = data.queueHealth.queues.find((queue) => queue.name === "analyze_visit");
  const embedQueue = data.queueHealth.queues.find((queue) => queue.name === "embed_visit_report");
  const failedCount = data.queueHealth.queues.reduce((total, queue) => total + Number(queue.counts.failed ?? 0), 0);

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal">AI Operations</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-navy">Execution Control Room</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Queue health, async AI timelines, failures, and telemetry signals for RetailOS workflows.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LatencyChip latency={data.latency} />
          <Badge variant={data.workerHealth.status === "healthy" ? "success" : "warning"} className="w-fit gap-2 px-3 py-1">
            <RadioTower className="h-3.5 w-3.5" />
            {data.workerHealth.status}: {data.workerHealth.reason}
          </Badge>
        </div>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OpsStat icon={Workflow} label="Analyze Queue" value={queueLabel(analyzeQueue)} helper="waiting / active" />
        <OpsStat icon={DatabaseZap} label="Embedding Queue" value={queueLabel(embedQueue)} helper="Pinecone indexing" />
        <OpsStat icon={AlertTriangle} label="Failed Jobs" value={failedCount} helper="across queues" intent={failedCount > 0 ? "critical" : "default"} />
        <OpsStat icon={Activity} label="Assistant Events" value={data.assistant.recentQueries} helper="recent query signals" />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(360px,0.6fr)]">
        <Card className="border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-navy">
              <Clock3 className="h-5 w-5 text-teal" />
              Processing Timelines
            </CardTitle>
            <p className="text-sm text-muted-foreground">Reconstructed from EventLog correlation IDs and workflow events.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.timelines.length === 0 ? (
              <EmptyState text="No visit timelines yet. Submit a rep visit to see the AI workflow unfold here." />
            ) : (
              data.timelines.map((timeline, index) => (
                <TimelineCard key={timeline.visitId} index={index} timeline={timeline} />
              ))
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-navy">
                <Gauge className="h-5 w-5 text-teal" />
                Queue Indicators
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.queueHealth.queues.map((queue) => (
                <div key={queue.name} className="rounded-xl border border-[#d6ddea] p-3">
                  <p className="font-semibold text-navy">{queue.name}</p>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
                    {["waiting", "active", "failed"].map((state) => (
                      <div key={state} className="rounded-lg bg-[#eef2fb] p-2">
                        <p className="font-bold text-navy">{queue.counts[state] ?? 0}</p>
                        <p className="text-muted-foreground">{state}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
            <CardHeader>
              <CardTitle className="text-lg text-navy">Recent Failures</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.failures.length === 0 ? (
                <EmptyState text="No recent failed events." />
              ) : (
                data.failures.map((event) => (
                  <div key={event.id} className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm">
                    <p className="font-semibold text-rose-800">{humanize(event.event)}</p>
                    <p className="mt-1 text-xs text-rose-700">{event.outletName ?? event.visitId ?? event.jobId}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function TimelineCard({ index, timeline }: { index: number; timeline: OpsData["timelines"][number] }) {
  const [open, setOpen] = useState(index === 0);
  const latestEvent = timeline.events[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.03 }}
      className="rounded-2xl border border-[#d6ddea] bg-[#f8fafc]"
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex w-full flex-col gap-3 p-4 text-left sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="h-4 w-4 text-teal" /> : <ChevronRight className="h-4 w-4 text-teal" />}
            <p className="truncate font-semibold text-navy">{timeline.outletName}</p>
          </div>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {timeline.visitId} / {timeline.repName}
            {latestEvent ? ` / latest: ${humanize(latestEvent.event)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <VisitStatusBadge status={timeline.visitStatus} />
          <Badge variant="secondary">{timeline.complianceScore ?? "N/A"}% compliance</Badge>
          <Badge variant={timeline.fraudSignals > 0 ? "warning" : "success"}>{fraudSignalLabel(timeline.fraudSignals)}</Badge>
          {timeline.durationMs !== null && <DurationPill value={timeline.durationMs} />}
        </div>
      </button>
      {open && (
        <div className="space-y-3 border-t border-[#d6ddea] p-4">
          {timeline.events.map((event) => (
            <div key={event.id} className="grid gap-3 rounded-xl bg-white p-3 text-sm sm:grid-cols-[92px_132px_minmax(0,1fr)_auto]">
              <span className="font-mono text-xs text-muted-foreground">{timeOnly(event.createdAt)}</span>
              <StageBadge stage={event.stage} level={event.level} />
              <div>
                <p className="font-medium text-navy">{humanize(event.event)}</p>
                <p className="truncate text-xs text-muted-foreground">{event.traceId ?? event.jobId ?? "no correlation id"}</p>
              </div>
              {event.latencyMs !== null && <DurationPill value={event.latencyMs} />}
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

function OpsStat({ icon: Icon, label, value, helper, intent = "default" }: { icon: typeof Activity; label: string; value: string | number; helper: string; intent?: "default" | "critical" }) {
  const critical = intent === "critical";
  return (
    <Card className={critical ? "border-rose-200 bg-white shadow-sm" : "border-[#d6ddea] bg-white shadow-sm"}>
      <CardContent className="p-5">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className={critical ? "h-5 w-5 text-rose-600" : "h-5 w-5 text-teal"} />
          <p className="text-xs font-bold uppercase tracking-wide">{label}</p>
        </div>
        <p className={critical ? "mt-4 text-3xl font-bold text-rose-600" : "mt-4 text-3xl font-bold text-navy"}>{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function queueLabel(queue: OpsData["queueHealth"]["queues"][number] | undefined) {
  return `${queue?.counts.waiting ?? 0} / ${queue?.counts.active ?? 0}`;
}

function LatencyChip({ latency }: { latency: OpsData["latency"] }) {
  const topStages = latency.byStage.slice(0, 3);
  return (
    <div className="flex w-fit flex-wrap items-center gap-2 rounded-full border border-[#d6ddea] bg-white px-3 py-1.5 text-xs shadow-sm">
      <span className="font-semibold uppercase tracking-wide text-muted-foreground">Workflow avg</span>
      <span className="font-mono text-sm font-bold tabular-nums text-navy">
        {latency.averageMs === null ? "N/A" : formatMs(latency.averageMs)}
      </span>
      <span className="text-muted-foreground">/{latency.sampleCount} visits</span>
      {topStages.length > 0 && <span className="hidden h-4 w-px bg-[#d6ddea] sm:inline-block" />}
      {topStages.map((stage) => (
        <span key={stage.stage} className="hidden items-center gap-1 rounded-full bg-[#eef2fb] px-2 py-0.5 text-muted-foreground sm:inline-flex">
          {stage.stage}: <strong className="font-mono text-navy">{stage.averageMs === null ? "N/A" : formatMs(stage.averageMs)}</strong>
        </span>
      ))}
    </div>
  );
}

function StageBadge({ stage, level }: { stage: string; level: string }) {
  return <span className={`inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold ${stageBadgeStyles(stage, level)}`}>{stage}</span>;
}

function stageBadgeStyles(stage: string, level: string) {
  if (level === "error") return "bg-rose-100 text-rose-800";
  if (level === "warn") return "bg-amber-100 text-amber-900";
  const normalized = stage.toLowerCase();
  if (normalized.includes("upload")) return "bg-sky-100 text-sky-800";
  if (normalized.includes("queue")) return "bg-violet-100 text-violet-800";
  if (normalized.includes("yolo") || normalized.includes("analyze")) return "bg-cyan-100 text-cyan-800";
  if (normalized.includes("fraud")) return "bg-rose-100 text-rose-800";
  if (normalized.includes("report")) return "bg-emerald-100 text-emerald-800";
  if (normalized.includes("embedding")) return "bg-indigo-100 text-indigo-800";
  if (normalized.includes("assistant")) return "bg-fuchsia-100 text-fuchsia-800";
  return "bg-slate-100 text-slate-700";
}

function VisitStatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const variant = normalized === "FAILED" ? "critical" : normalized === "FLAGGED" ? "warning" : normalized === "COMPLETE" ? "success" : "secondary";
  return <Badge variant={variant}>{humanize(status)}</Badge>;
}

function DurationPill({ value }: { value: number }) {
  return (
    <span className="inline-flex h-7 min-w-[64px] items-center justify-center rounded-full bg-[#eef2fb] px-2.5 text-xs font-semibold tabular-nums text-navy">
      {formatMs(value)}
    </span>
  );
}

function fraudSignalLabel(count: number) {
  return `${count} fraud signal${count === 1 ? "" : "s"}`;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-[#c1c7cc] p-4 text-center text-sm text-muted-foreground">{text}</div>;
}

function formatMs(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function timeOnly(value: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function humanize(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
