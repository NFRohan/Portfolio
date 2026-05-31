"use client";

import type { ReactNode } from "react";
import { useDeferredValue, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ComplianceBadge } from "@/components/compliance-badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { VisitListItem, VisitLogsResponse } from "@/lib/types";
import { formatDate } from "@/lib/utils";
import { AlertTriangle, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Search, ShieldAlert, SlidersHorizontal } from "lucide-react";

const PAGE_SIZE = 5;

export default function SupervisorVisitLogsPage() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "safe" | "flagged">("all");
  const [page, setPage] = useState(1);
  const deferredQuery = useDeferredValue(query);

  const { data, isLoading } = useQuery<VisitLogsResponse>({
    queryKey: ["visit-logs", deferredQuery, status, page],
    queryFn: () => fetch(visitLogsUrl({ query: deferredQuery, status, page })).then((r) => r.json()),
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  const visits = data?.items ?? [];
  const facets = data?.facets;
  const pagination = data?.pagination;

  function selectStatus(nextStatus: "all" | "safe" | "flagged") {
    setStatus(nextStatus);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-[1440px] space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Visit Logs</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage and review all field execution submissions.</p>
      </div>

      <div className="rounded-xl border border-[#d6ddea] bg-white p-4 shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-3 sm:flex-row">
            <label className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setPage(1);
                }}
                placeholder="Search outlet or rep..."
                className="h-10 w-full rounded-lg border border-[#c1c7cc] bg-white pl-9 pr-3 text-sm outline-none transition-colors focus:border-teal focus:ring-2 focus:ring-teal/20"
              />
            </label>

            <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#c1c7cc] bg-white px-3 text-sm font-medium text-navy transition-colors hover:border-teal hover:bg-[#e9f7fb]">
              <CalendarDays className="h-4 w-4" />
              Last 7 Days
            </button>
          </div>

          <div className="flex overflow-hidden rounded-lg border border-[#c1c7cc] bg-[#eef2fb] p-1">
            <SegmentButton active={status === "all"} onClick={() => selectStatus("all")}>
              All Logs
            </SegmentButton>
            <SegmentButton active={status === "safe"} onClick={() => selectStatus("safe")}>
              Safe
            </SegmentButton>
            <SegmentButton active={status === "flagged"} onClick={() => selectStatus("flagged")}>
              Flagged
              <span className="ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[#edbd95] px-1 text-[10px] font-bold text-[#3c2105]">
                {facets?.flagged ?? 0}
              </span>
            </SegmentButton>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
        {isLoading ? (
          <div className="space-y-2 p-4">
            {[1, 2, 3, 4, 5].map((item) => (
              <Skeleton key={item} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : (
          <>
            <VisitLogsTable visits={visits} />
            <div className="flex flex-col gap-3 border-t bg-[#eef2fb] px-4 py-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                Showing <strong className="text-navy">{visits.length === 0 ? 0 : (pagination?.page ?? 1) * PAGE_SIZE - PAGE_SIZE + 1}</strong> to{" "}
                <strong className="text-navy">{Math.min((pagination?.page ?? 1) * PAGE_SIZE, pagination?.total ?? 0)}</strong> of{" "}
                <strong className="text-navy">{pagination?.total ?? 0}</strong> results
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(pagination?.page ?? 1) <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="rounded-md border bg-white px-3 py-1 text-sm font-semibold text-navy">
                  {pagination?.page ?? 1} / {pagination?.totalPages ?? 1}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={(pagination?.page ?? 1) >= (pagination?.totalPages ?? 1)}
                  onClick={() => setPage((current) => current + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function VisitLogsTable({ visits }: { visits: VisitListItem[] }) {
  if (visits.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-16 text-center text-muted-foreground">
        <SlidersHorizontal className="h-10 w-10 text-teal" />
        <div>
          <p className="font-semibold text-navy">No visits match these filters</p>
          <p className="text-sm">Try widening the search or status filter.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b bg-navy/5 text-xs font-semibold uppercase tracking-wide text-navy">
            <th className="px-4 py-3">Timestamp</th>
            <th className="px-4 py-3">Outlet Name</th>
            <th className="px-4 py-3">Rep Name</th>
            <th className="px-4 py-3 text-center">Compliance Score</th>
            <th className="px-4 py-3 text-center">Fraud Signals</th>
            <th className="px-4 py-3 text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {visits.map((visit) => (
            <tr
              key={visit.id}
              className={visit.riskStatus === "HIGH_RISK" ? "border-b bg-rose-50/50 last:border-0" : "border-b last:border-0 hover:bg-teal/5"}
            >
              <td className="whitespace-nowrap px-4 py-4 text-muted-foreground">{formatDate(visit.createdAt)}</td>
              <td className="px-4 py-4 font-semibold text-navy">
                {visit.outletName}
                <div className="text-xs font-normal text-muted-foreground">{visit.outletCode}</div>
              </td>
              <td className="px-4 py-4 text-muted-foreground">{visit.repName}</td>
              <td className="px-4 py-4 text-center">
                <ComplianceBadge score={visit.complianceScore} status={visit.complianceStatus} />
              </td>
              <td className="px-4 py-4 text-center">
                <FraudBadge visit={visit} />
              </td>
              <td className="px-4 py-4 text-right">
                <Link
                  href={`/supervisor/visits/${visit.id}`}
                  className="rounded-md px-3 py-1.5 text-sm font-semibold text-teal transition-colors hover:bg-teal/10 hover:underline"
                >
                  Inspect
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SegmentButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "flex items-center rounded-md bg-white px-4 py-1.5 text-xs font-bold text-navy shadow-sm"
          : "flex items-center rounded-md px-4 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-white/70 hover:text-navy"
      }
    >
      {children}
    </button>
  );
}

function FraudBadge({ visit }: { visit: VisitListItem }) {
  if (visit.hasHighFraud) {
    return (
      <Badge variant="critical" className="gap-1">
        <ShieldAlert className="h-3.5 w-3.5" />
        High Risk
      </Badge>
    );
  }
  if (visit.fraudCount > 0) {
    return (
      <Badge variant="warning" className="gap-1">
        <AlertTriangle className="h-3.5 w-3.5" />
        {visit.fraudCount} signal{visit.fraudCount === 1 ? "" : "s"}
      </Badge>
    );
  }
  return (
    <Badge variant="success" className="gap-1">
      <CheckCircle2 className="h-3.5 w-3.5" />
      No fraud
    </Badge>
  );
}

function visitLogsUrl({ query, status, page }: { query: string; status: string; page: number }) {
  const params = new URLSearchParams({
    scope: "all",
    page: String(page),
    pageSize: String(PAGE_SIZE),
    status,
  });
  const from = new Date();
  from.setDate(from.getDate() - 6);
  from.setHours(0, 0, 0, 0);
  params.set("from", from.toISOString().slice(0, 10));
  if (query.trim()) params.set("q", query.trim());
  return `/api/visits?${params.toString()}`;
}
