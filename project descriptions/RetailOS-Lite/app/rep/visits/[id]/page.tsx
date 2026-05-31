"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnalyzingPipeline } from "@/components/analyzing-pipeline";
import { RepVisitResultsPanel } from "@/components/rep-visit-results-panel";
import { VisitStatusBadge } from "@/components/visit-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { VisitDetail } from "@/lib/types";
import { TERMINAL_STATUSES } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { AlertCircle, CheckCircle2, ChevronLeft } from "lucide-react";
import { useEffect, useState } from "react";

export default function RepVisitDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [pipelineStep, setPipelineStep] = useState(0);

  const { data: visit, isLoading } = useQuery<VisitDetail>({
    queryKey: ["visit", id],
    queryFn: () => fetch(`/api/visits/${id}`).then((r) => r.json()),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && TERMINAL_STATUSES.includes(status)) return false;
      return 750;
    },
    refetchIntervalInBackground: true,
  });

  useEffect(() => {
    if (visit?.status !== "ANALYZING") return;
    const interval = setInterval(() => {
      setPipelineStep((s) => (s < 4 ? s + 1 : s));
    }, 1400);
    return () => clearInterval(interval);
  }, [visit?.status]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 bg-white" />
        <Skeleton className="h-32 w-full rounded-3xl bg-white" />
      </div>
    );
  }

  if (!visit) {
    return <p className="text-rose-700">Visit not found</p>;
  }

  const outcome = visit.aiResult?.outcomeSummary ?? null;

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-navy">
        <Link href="/rep/visits">
          <ChevronLeft className="mr-1 h-4 w-4" />
          My Visits
        </Link>
      </Button>

      <div className="rounded-3xl border border-[#d6ddea] bg-white p-5 shadow-[0_8px_28px_rgba(2,43,58,0.06)]">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal">Visit Intelligence</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-navy">{visit.outlet.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {visit.outlet.code} / {formatDate(visit.createdAt)}
        </p>
        <div className="mt-4">
          <VisitStatusBadge status={visit.status} />
        </div>
      </div>

      {visit.status === "ANALYZING" && <AnalyzingPipeline activeStep={pipelineStep} />}

      {visit.status === "COMPLETE" && (
        <Card className="border-emerald-200 bg-emerald-50">
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-5 w-5 text-emerald-700" />
            <p className="text-sm font-semibold text-emerald-800">Analysis complete</p>
          </CardContent>
        </Card>
      )}

      {visit.status === "FLAGGED" && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="flex items-center gap-3 p-4">
            <AlertCircle className="h-5 w-5 text-rose-700" />
            <p className="text-sm font-semibold text-rose-800">Visit flagged - supervisor review required</p>
          </CardContent>
        </Card>
      )}

      {visit.status === "FAILED" && (
        <Card className="border-rose-200 bg-rose-50">
          <CardContent className="p-4">
            <p className="text-sm font-semibold text-rose-800">Analysis failed. Contact your supervisor.</p>
          </CardContent>
        </Card>
      )}

      {(visit.status === "COMPLETE" || visit.status === "FLAGGED") && (
        <RepVisitResultsPanel visit={visit} outcome={outcome} />
      )}
    </div>
  );
}
