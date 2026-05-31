"use client";

import Link from "next/link";
import type { ComponentType } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/utils";
import { CheckCircle2, ExternalLink, GitMerge, Loader2, MapPin, SearchCheck, Store, X } from "lucide-react";

type PossibleMatch = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  distanceMeters: number;
  confidence: number;
  visitCount: number;
};

type OutletRecord = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  verificationStatus: "VERIFIED" | "UNVERIFIED" | "REJECTED";
  createdByVisitId?: string | null;
  createdAt: string;
  _count?: {
    visits: number;
  };
};

type OutletSubmissionReview = {
  id: string;
  submittedName: string;
  submittedLat: number | null;
  submittedLng: number | null;
  status: "AUTO_MATCHED" | "PENDING_REVIEW" | "NEW_OUTLET" | "APPROVED" | "REJECTED" | "MERGED";
  matchConfidence: number | null;
  possibleMatches: PossibleMatch[];
  visitId: string | null;
  createdAt: string;
  rep: {
    name: string;
    email: string;
  };
  matchedOutlet: OutletRecord | null;
  createdOutlet: OutletRecord | null;
};

type PendingOutletResponse = {
  submissions: OutletSubmissionReview[];
  orphanedOutlets: OutletRecord[];
};

type ReviewAction =
  | { kind: "approve"; outletId: string; submissionId?: string }
  | { kind: "reject"; outletId: string; submissionId?: string }
  | { kind: "merge"; sourceOutletId: string; targetOutletId: string; submissionId?: string };

export default function OutletVerificationPage() {
  const queryClient = useQueryClient();
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [error, setError] = useState("");

  const { data, isLoading } = useQuery<PendingOutletResponse>({
    queryKey: ["outlet-pending"],
    queryFn: async () => {
      const response = await fetch("/api/outlets/pending");
      if (!response.ok) throw new Error("Could not load outlet review queue.");
      return response.json();
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });
  const { data: masterOutlets = [], isLoading: masterLoading } = useQuery<OutletRecord[]>({
    queryKey: ["outlets-master"],
    queryFn: async () => {
      const response = await fetch("/api/outlets");
      if (!response.ok) throw new Error("Could not load master outlet list.");
      return response.json();
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const submissions = data?.submissions ?? [];
  const orphanedOutlets = data?.orphanedOutlets ?? [];
  const pendingCount = submissions.length + orphanedOutlets.length;
  const duplicateHints = submissions.filter((submission) => submission.possibleMatches.length > 0).length;

  const mutation = useMutation({
    mutationFn: async (action: ReviewAction) => {
      setError("");
      setActiveAction(actionKey(action));
      const endpoint =
        action.kind === "merge"
          ? `/api/outlets/${action.sourceOutletId}/merge`
          : `/api/outlets/${action.outletId}/${action.kind}`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Could not update outlet review.");
      }
      return response.json();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["outlet-pending"] });
      await queryClient.invalidateQueries({ queryKey: ["outlets"] });
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : "Could not update outlet review.");
    },
    onSettled: () => {
      setActiveAction(null);
    },
  });

  return (
    <div className="mx-auto max-w-[1440px] space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-navy">Outlet Verification</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Govern rep-submitted shop names with confidence scoring, GPS-scoped matches, and merge decisions.
        </p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        <VerificationStat icon={Store} label="Pending Reviews" value={pendingCount} helper="Submissions needing action" />
        <VerificationStat icon={SearchCheck} label="Duplicate Hints" value={duplicateHints} helper="Nearby possible matches" />
        <VerificationStat icon={MapPin} label="Search Radius" value="100m" helper="GPS-scoped outlet matching" />
      </section>

      <Card className="overflow-hidden border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
        <CardHeader className="border-b bg-white p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl text-navy">Master Data Review Queue</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Approve real new shops, reject bad submissions, or merge duplicates into canonical outlets.
              </p>
            </div>
            <Badge variant={pendingCount > 0 ? "warning" : "success"} className="w-fit">
              {pendingCount} pending
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {error && <p className="m-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
          {isLoading ? (
            <OutletQueueSkeleton />
          ) : (
            <OutletReviewQueue
              activeAction={activeAction}
              onAction={mutation.mutate}
              orphanedOutlets={orphanedOutlets}
              submissions={submissions}
            />
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
        <CardHeader className="border-b bg-white p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="text-xl text-navy">Master Outlet List</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">
                Canonical shops already known to RetailOS, including verified, pending, and rejected records.
              </p>
            </div>
            <Badge variant="secondary" className="w-fit">
              {masterOutlets.length} outlets
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {masterLoading ? <OutletQueueSkeleton /> : <MasterOutletList outlets={masterOutlets} />}
        </CardContent>
      </Card>
    </div>
  );
}

function VerificationStat({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  helper: string;
}) {
  return (
    <Card className="min-h-[124px] border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
      <CardHeader className="flex flex-row items-center gap-2 pb-3">
        <Icon className="h-5 w-5 text-muted-foreground" />
        <CardTitle className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold text-navy">{value}</span>
          <span className="text-sm text-muted-foreground">{helper}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function OutletReviewQueue({
  activeAction,
  onAction,
  orphanedOutlets,
  submissions,
}: {
  activeAction: string | null;
  onAction: (action: ReviewAction) => void;
  orphanedOutlets: OutletRecord[];
  submissions: OutletSubmissionReview[];
}) {
  if (submissions.length === 0 && orphanedOutlets.length === 0) {
    return (
      <div className="p-12 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <p className="mt-3 font-semibold text-navy">No outlet reviews pending.</p>
        <p className="mt-1 text-sm text-muted-foreground">Rep submissions that need master-data decisions will appear here.</p>
      </div>
    );
  }

  return (
    <div className="divide-y">
      {submissions.map((submission) => (
        <SubmissionReviewCard
          key={submission.id}
          activeAction={activeAction}
          onAction={onAction}
          submission={submission}
        />
      ))}
      {orphanedOutlets.map((outlet) => (
        <OrphanedOutletCard key={outlet.id} activeAction={activeAction} onAction={onAction} outlet={outlet} />
      ))}
    </div>
  );
}

function SubmissionReviewCard({
  activeAction,
  onAction,
  submission,
}: {
  activeAction: string | null;
  onAction: (action: ReviewAction) => void;
  submission: OutletSubmissionReview;
}) {
  const reviewOutlet = submission.createdOutlet ?? submission.matchedOutlet;
  const sourceOutletId = submission.createdOutlet?.id;
  const approveOutletId = reviewOutlet?.id;
  const matches = submission.possibleMatches.filter((match) => match.id !== reviewOutlet?.id).slice(0, 3);

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold text-navy">{submission.submittedName}</h2>
            <StatusBadge status={submission.status} />
            {submission.matchConfidence !== null && (
              <Badge variant={submission.matchConfidence >= 0.9 ? "success" : "warning"}>
                {Math.round(submission.matchConfidence * 100)}% match
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Submitted by {submission.rep.name} on {formatDate(submission.createdAt)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            GPS:{" "}
            {submission.submittedLat !== null && submission.submittedLng !== null
              ? `${submission.submittedLat.toFixed(5)}, ${submission.submittedLng.toFixed(5)}`
              : "not captured"}
          </p>
        </div>

        <div className="flex flex-wrap justify-start gap-2 xl:justify-end">
          {submission.visitId && (
            <Button variant="outline" size="sm" className="rounded-full bg-white" asChild>
              <Link href={`/supervisor/visits/${submission.visitId}`}>
                <ExternalLink className="h-4 w-4" />
                Visit
              </Link>
            </Button>
          )}
          {approveOutletId && (
            <ReviewButton
              action={{ kind: "approve", outletId: approveOutletId, submissionId: submission.id }}
              activeAction={activeAction}
              className="bg-teal text-white hover:bg-teal/90"
              icon={CheckCircle2}
              label={submission.createdOutlet ? "Approve New" : "Approve Match"}
              onAction={onAction}
            />
          )}
          {approveOutletId && (
            <ReviewButton
              action={{ kind: "reject", outletId: approveOutletId, submissionId: submission.id }}
              activeAction={activeAction}
              className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
              icon={X}
              label="Reject"
              onAction={onAction}
              variant="outline"
            />
          )}
        </div>
      </div>

      {reviewOutlet && (
        <div className="rounded-xl border border-[#d6ddea] bg-[#f9f9ff] p-3 text-sm">
          <p className="font-semibold text-navy">
            Current resolution: {reviewOutlet.name} <span className="text-muted-foreground">({reviewOutlet.code})</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {reviewOutlet.verificationStatus} • {reviewOutlet._count?.visits ?? 0} visit
            {(reviewOutlet._count?.visits ?? 0) === 1 ? "" : "s"}
          </p>
        </div>
      )}

      {sourceOutletId && matches.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Suggested duplicate matches</p>
          <div className="grid gap-2 lg:grid-cols-3">
            {matches.map((match) => (
              <div key={match.id} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="font-semibold text-navy">{match.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {match.code} • {match.distanceMeters}m away • {match.visitCount} visit
                  {match.visitCount === 1 ? "" : "s"}
                </p>
                <p className="mt-2 text-xs text-amber-900">
                  Merge moves visits and AI reports into this canonical outlet.
                </p>
                <ReviewButton
                  action={{ kind: "merge", sourceOutletId, targetOutletId: match.id, submissionId: submission.id }}
                  activeAction={activeAction}
                  className="mt-3 w-full rounded-full"
                  icon={GitMerge}
                  label={`Merge (${Math.round(match.confidence * 100)}%)`}
                  onAction={onAction}
                  size="sm"
                  variant="outline"
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function OrphanedOutletCard({
  activeAction,
  onAction,
  outlet,
}: {
  activeAction: string | null;
  onAction: (action: ReviewAction) => void;
  outlet: OutletRecord;
}) {
  return (
    <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-navy">{outlet.name}</h2>
          <Badge variant="warning">Pending outlet record</Badge>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {outlet.code} • Created {formatDate(outlet.createdAt)} • {outlet._count?.visits ?? 0} visit
          {(outlet._count?.visits ?? 0) === 1 ? "" : "s"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {outlet.createdByVisitId && (
          <Button variant="outline" size="sm" className="rounded-full bg-white" asChild>
            <Link href={`/supervisor/visits/${outlet.createdByVisitId}`}>
              <ExternalLink className="h-4 w-4" />
              Visit
            </Link>
          </Button>
        )}
        <ReviewButton
          action={{ kind: "approve", outletId: outlet.id }}
          activeAction={activeAction}
          className="bg-teal text-white hover:bg-teal/90"
          icon={CheckCircle2}
          label="Approve"
          onAction={onAction}
        />
        <ReviewButton
          action={{ kind: "reject", outletId: outlet.id }}
          activeAction={activeAction}
          className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50"
          icon={X}
          label="Reject"
          onAction={onAction}
          variant="outline"
        />
      </div>
    </div>
  );
}

function MasterOutletList({ outlets }: { outlets: OutletRecord[] }) {
  if (outlets.length === 0) {
    return (
      <div className="p-12 text-center">
        <Store className="mx-auto h-10 w-10 text-teal" />
        <p className="mt-3 font-semibold text-navy">No outlets in the master registry yet.</p>
        <p className="mt-1 text-sm text-muted-foreground">Rep-created or supervisor-approved shops will appear here.</p>
      </div>
    );
  }

  return (
    <div className="max-h-[520px] overflow-auto">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 z-10 border-b bg-navy/5 text-xs font-semibold uppercase tracking-wide text-navy">
          <tr>
            <th className="px-4 py-3">Outlet</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">GPS</th>
            <th className="px-4 py-3">Visits</th>
            <th className="px-4 py-3">Created</th>
          </tr>
        </thead>
        <tbody>
          {outlets.map((outlet) => (
            <tr key={outlet.id} className="border-b last:border-0 hover:bg-teal/5">
              <td className="px-4 py-3">
                <p className="font-semibold text-navy">{outlet.name}</p>
                <p className="text-xs text-muted-foreground">{outlet.code}</p>
                {outlet.address && <p className="mt-1 text-xs text-muted-foreground">{outlet.address}</p>}
              </td>
              <td className="px-4 py-3">
                <OutletStatusBadge status={outlet.verificationStatus} />
              </td>
              <td className="px-4 py-3 text-xs text-muted-foreground">
                {outlet.latitude !== null && outlet.longitude !== null
                  ? `${outlet.latitude.toFixed(5)}, ${outlet.longitude.toFixed(5)}`
                  : "Not captured"}
              </td>
              <td className="px-4 py-3 text-muted-foreground">{outlet._count?.visits ?? 0}</td>
              <td className="px-4 py-3 text-muted-foreground">{formatDate(outlet.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OutletStatusBadge({ status }: { status: OutletRecord["verificationStatus"] }) {
  if (status === "VERIFIED") return <Badge variant="success">Verified</Badge>;
  if (status === "REJECTED") return <Badge variant="critical">Rejected</Badge>;
  return <Badge variant="warning">Pending</Badge>;
}

function ReviewButton({
  action,
  activeAction,
  className,
  icon: Icon,
  label,
  onAction,
  size = "sm",
  variant,
}: {
  action: ReviewAction;
  activeAction: string | null;
  className?: string;
  icon: ComponentType<{ className?: string }>;
  label: string;
  onAction: (action: ReviewAction) => void;
  size?: "sm" | "default";
  variant?: "outline";
}) {
  const key = actionKey(action);
  return (
    <Button
      className={className}
      disabled={Boolean(activeAction)}
      size={size}
      variant={variant}
      onClick={() => onAction(action)}
    >
      {activeAction === key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </Button>
  );
}

function StatusBadge({ status }: { status: OutletSubmissionReview["status"] }) {
  if (status === "NEW_OUTLET") return <Badge variant="warning">New Outlet</Badge>;
  if (status === "PENDING_REVIEW") return <Badge variant="warning">Review Match</Badge>;
  if (status === "AUTO_MATCHED") return <Badge variant="success">Auto Matched</Badge>;
  if (status === "APPROVED") return <Badge variant="success">Approved</Badge>;
  if (status === "MERGED") return <Badge variant="success">Merged</Badge>;
  return <Badge variant="critical">Rejected</Badge>;
}

function OutletQueueSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {[1, 2, 3].map((item) => (
        <Skeleton key={item} className="h-24 rounded-xl bg-[#eef2fb]" />
      ))}
    </div>
  );
}

function actionKey(action: ReviewAction): string {
  if (action.kind === "merge") {
    return `${action.kind}:${action.sourceOutletId}:${action.targetOutletId}:${action.submissionId ?? "none"}`;
  }
  return `${action.kind}:${action.outletId}:${action.submissionId ?? "none"}`;
}
