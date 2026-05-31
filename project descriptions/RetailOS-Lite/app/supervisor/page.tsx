"use client";

import type { ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { VisitTable } from "@/components/visit-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { DashboardData } from "@/lib/types";
import { AlertTriangle, ClipboardCheck, MapPin, PackageX, ShieldCheck, TrendingUp } from "lucide-react";

export default function SupervisorDashboardPage() {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["dashboard", "7d", timeZone],
    queryFn: () => fetch(`/api/dashboard?range=7d&tz=${encodeURIComponent(timeZone)}`).then((r) => r.json()),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl bg-white" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl bg-white" />
      </div>
    );
  }

  const summary = data?.summary;
  const trend = data?.trend ?? [];
  const recentVisits = data?.recentVisits ?? data?.visits ?? [];

  return (
    <div className="mx-auto max-w-[1440px] space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Supervisor Overview</h1>
        <p className="mt-1 text-sm text-muted-foreground">Real-time field execution and analytics.</p>
      </div>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          delay={0}
          icon={MapPin}
          label="Total Visits Today"
          value={summary?.visitsToday ?? data?.visitsToday ?? 0}
        />
        <MetricCard
          delay={0.04}
          icon={ShieldCheck}
          label="Avg Compliance Score"
          value={`${summary?.avgComplianceScore ?? data?.avgComplianceScore ?? 0}%`}
          helper={
            summary?.previousAvgComplianceScore
              ? `Up from ${summary.previousAvgComplianceScore}%`
              : "Current 7-day average"
          }
        />
        <MetricCard
          delay={0.08}
          icon={PackageX}
          label="Missing POSM"
          value={summary?.missingPosmCount ?? 0}
          helper="Active alerts"
        />
        <MetricCard
          delay={0.12}
          icon={AlertTriangle}
          label="Flagged Frauds"
          value={summary?.fraudDetectionCount ?? 0}
          helper="Detections"
          intent="critical"
        />
        <PosmComplianceCard percentage={summary?.posmCompliancePct ?? 0} delta={summary?.posmComplianceDeltaPct ?? 0} />
        <PerformanceTrendCard score={summary?.qualityScore ?? 0} trend={trend} />
      </section>

      <Card className="overflow-hidden border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
        <CardHeader className="border-b bg-white p-6">
          <div>
            <CardTitle className="text-xl text-navy">Recent Visits</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Focusing on Olympic visibility, POSM, compliance, and fraud review reasons.
            </p>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <VisitTable visits={recentVisits} />
        </CardContent>
      </Card>
    </div>
  );
}

type MetricCardProps = {
  delay: number;
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  delta?: string;
  helper?: string;
  intent?: "default" | "critical";
};

function MetricCard({ delay, icon: Icon, label, value, delta, helper, intent = "default" }: MetricCardProps) {
  const critical = intent === "critical";
  return (
    <motion.div className="h-full" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <Card
        className={
          critical
            ? "relative h-full min-h-[124px] overflow-hidden border-rose-200 bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]"
            : "h-full min-h-[124px] border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]"
        }
      >
        {critical && <div className="absolute left-0 top-0 h-full w-1 bg-rose-500" />}
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <Icon className={critical ? "h-5 w-5 text-rose-600" : "h-5 w-5 text-muted-foreground"} />
          <CardTitle className={critical ? "text-xs font-semibold uppercase tracking-wide text-rose-700" : "text-xs font-semibold uppercase tracking-wide text-muted-foreground"}>
            {label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-3">
            <span className={critical ? "text-4xl font-bold text-rose-600" : "text-4xl font-bold text-navy"}>{value}</span>
            {(delta || helper) && (
              <span
                className={
                  delta
                    ? "rounded-full bg-teal/10 px-2 py-0.5 text-xs font-semibold text-teal"
                    : "text-sm text-muted-foreground"
                }
              >
                {delta ?? helper}
              </span>
            )}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function PosmComplianceCard({ percentage, delta }: { percentage: number; delta: number }) {
  const circumference = 213.6;
  const offset = circumference - (Math.max(0, Math.min(100, percentage)) / 100) * circumference;

  return (
    <Card className="h-full min-h-[124px] border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
      <CardContent className="flex items-center justify-between p-6">
        <div>
          <div className="mb-4 flex items-center gap-2 text-muted-foreground">
            <ClipboardCheck className="h-5 w-5" />
            <p className="text-xs font-semibold uppercase tracking-wide">POSM Compliance</p>
          </div>
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold text-navy">{percentage}%</span>
            <span className="text-sm font-semibold text-teal">{formatDelta(delta)}</span>
          </div>
        </div>
        <div className="relative h-20 w-20">
          <svg className="h-full w-full -rotate-90">
            <circle cx="40" cy="40" r="34" fill="transparent" stroke="#e4e8f5" strokeWidth="8" />
            <circle
              cx="40"
              cy="40"
              r="34"
              fill="transparent"
              stroke="#1f7a8c"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              strokeWidth="8"
            />
          </svg>
          <ShieldCheck className="absolute inset-0 m-auto h-6 w-6 text-teal" />
        </div>
      </CardContent>
    </Card>
  );
}

function PerformanceTrendCard({
  score,
  trend,
}: {
  score: number;
  trend: DashboardData["trend"];
}) {
  const maxScore = Math.max(100, ...trend.map((point) => point.qualityScore));

  return (
    <Card className="h-full min-h-[124px] border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div className="flex items-center gap-2 text-muted-foreground">
          <TrendingUp className="h-5 w-5" />
          <CardTitle className="text-xs font-semibold uppercase tracking-wide">Visit Quality</CardTitle>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">No review reasons / total visits</span>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Clean visit rate</p>
            <p className="text-4xl font-bold text-navy">{score}%</p>
            <p className="mt-1 max-w-48 text-xs text-muted-foreground">
              No fraud, POSM present, and Compliance at least 70%.
            </p>
          </div>
          <div className="flex h-14 flex-1 items-end gap-1">
            {trend.slice(-7).map((point) => (
              <div
                key={point.date}
                className="flex-1 rounded-t bg-teal/25"
                style={{ height: `${Math.max(14, (point.qualityScore / maxScore) * 100)}%` }}
                title={`${point.date}: ${point.qualityScore}%`}
              >
                <div className="h-full rounded-t bg-teal/70" />
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function formatDelta(value: number | undefined) {
  const safe = value ?? 0;
  return `${safe >= 0 ? "+" : ""}${safe}%`;
}
