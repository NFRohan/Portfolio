"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { VisitStatusBadge } from "@/components/visit-status-badge";
import { ComplianceBadge } from "@/components/compliance-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useOfflineVisitQueue } from "@/hooks/use-offline-visit-sync";
import type { VisitListItem } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { ChevronRight, ClipboardList, CloudOff } from "lucide-react";

export default function RepVisitsPage() {
  const { data: visits, isLoading } = useQuery<VisitListItem[]>({
    queryKey: ["visits"],
    queryFn: () => fetch("/api/visits").then((r) => r.json()),
  });
  const { data: offlineVisits = [] } = useOfflineVisitQueue();
  const submittedVisits = visits ?? [];
  const totalVisits = submittedVisits.length + offlineVisits.length;

  if (isLoading && offlineVisits.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 w-full rounded-3xl bg-white" />
        ))}
      </div>
    );
  }

  if (totalVisits === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-[#b9c4d8] bg-white px-6 py-16 text-center shadow-[0_8px_28px_rgba(2,43,58,0.06)]">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#eef2fb] text-teal">
          <ClipboardList className="h-7 w-7" />
        </div>
        <h2 className="text-lg font-bold text-navy">No visits yet</h2>
        <p className="mb-4 text-sm text-muted-foreground">Start your first outlet check-in</p>
        <Button className="rounded-full" asChild>
          <Link href="/rep/visits/new">New Visit</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal">Field Activity</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-navy">My Visits</h1>
          <p className="text-sm text-muted-foreground">
            {submittedVisits.length} submitted visit{submittedVisits.length === 1 ? "" : "s"}
            {offlineVisits.length > 0 && `, ${offlineVisits.length} pending sync`}
          </p>
        </div>
        <Button className="rounded-full" asChild>
          <Link href="/rep/visits/new">New</Link>
        </Button>
      </div>

      <div className="space-y-3">
        {offlineVisits.map((submission) => (
          <div
            key={submission.id}
            className="rounded-3xl border border-amber-200 bg-amber-50 p-4 shadow-[0_8px_28px_rgba(2,43,58,0.06)]"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CloudOff className="h-4 w-4 text-amber-700" />
                  <p className="font-bold text-amber-950">{submission.payload.outletName}</p>
                </div>
                <p className="text-xs text-amber-800">
                  {formatDate(submission.createdAt)} - 1 queued shelf image
                </p>
                {submission.lastError && <p className="text-xs text-amber-800">Last error: {submission.lastError}</p>}
              </div>
              <Badge variant={submission.status === "failed" ? "warning" : "outline"} className="bg-white">
                {submission.status === "syncing" ? "Syncing" : submission.status === "failed" ? "Retry needed" : "Pending sync"}
              </Badge>
            </div>
          </div>
        ))}

        {submittedVisits.map((visit) => (
          <Link
            key={visit.id}
            href={`/rep/visits/${visit.id}`}
            className="flex items-center justify-between rounded-3xl border border-[#d6ddea] bg-white p-4 shadow-[0_8px_28px_rgba(2,43,58,0.06)] transition-shadow hover:shadow-md"
          >
            <div className="space-y-1">
              <p className="font-bold text-navy">{visit.outletName}</p>
              <p className="text-xs text-muted-foreground">{formatDate(visit.createdAt)}</p>
              <div className="flex flex-wrap gap-2 pt-1">
                <VisitStatusBadge status={visit.status} />
                {visit.complianceScore !== null && (
                  <ComplianceBadge score={visit.complianceScore} status={visit.complianceStatus} />
                )}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </Link>
        ))}
      </div>
    </div>
  );
}
