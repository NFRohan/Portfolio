import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComplianceRing } from "@/components/compliance-ring";
import { FraudSignalsPanel } from "@/components/fraud-signals-panel";
import { ImageCompareSlider } from "@/components/image-compare-slider";
import { OlympicCompetitorChart } from "@/components/olympic-competitor-chart";
import type { OutcomeSummary, VisitDetail } from "@/lib/types";
import { AlertTriangle, Bot, Eye, ImageIcon, ListChecks, PackageCheck, Target } from "lucide-react";

type Props = {
  visit: VisitDetail;
  outcome: OutcomeSummary | null;
};

export function RepVisitResultsPanel({ visit, outcome }: Props) {
  if (!outcome && !visit.aiResult) return null;

  const score = outcome?.complianceScore ?? visit.aiResult?.complianceScore ?? 0;
  const status = outcome?.complianceStatus ?? visit.aiResult?.status ?? "unknown";
  const summary = outcome?.supervisorSummary ?? visit.aiResult?.supervisorSummary ?? "";
  const rawUrl = visit.images[0]?.url ?? "";
  const overlayUrl = visit.aiResult?.overlayImageUrl;
  const counts = outcome?.counts ?? { olympic: 0, competitor: 0, total: 0 };
  const countAudit = outcome?.countAudit;
  const useCountAudit = Boolean(
    countAudit &&
      !countAudit.yoloCountReliable &&
      countAudit.confidence >= 0.65 &&
      countAudit.olympicEstimate !== null &&
      countAudit.olympicEstimate !== undefined &&
      countAudit.competitorEstimate !== null &&
      countAudit.competitorEstimate !== undefined,
  );
  const displayCounts = useCountAudit
    ? {
        olympic: Math.max(0, countAudit?.olympicEstimate ?? 0),
        competitor: Math.max(0, countAudit?.competitorEstimate ?? 0),
      }
    : { olympic: counts.olympic, competitor: counts.competitor };
  const totalProducts = displayCounts.olympic + displayCounts.competitor;
  const olympicShare =
    useCountAudit && countAudit?.visualOlympicShare !== null && countAudit?.visualOlympicShare !== undefined
      ? Math.round(Math.max(0, Math.min(1, countAudit.visualOlympicShare)) * 100)
      : totalProducts > 0
        ? Math.round((displayCounts.olympic / totalProducts) * 100)
        : 0;
  const fraudSignals = (
    outcome?.fraudSignals ??
    visit.fraudSignals.map((signal) => ({
      type: signal.type,
      severity: signal.severity,
      message: signal.message,
    }))
  ).filter((signal) => signal.type !== "IMAGE_HASHED");
  const isFraudFlagged = fraudSignals.length > 0;
  const complianceReasons = (outcome?.complianceReasons ?? ["Analysis did not return detailed compliance reasons."]).filter(
    (reason) => !isCountAuditReason(reason),
  );

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden border-[#d6ddea] bg-white shadow-[0_8px_28px_rgba(2,43,58,0.06)]">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <Bot className="h-4 w-4 text-teal" />
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-teal">AI Result</p>
              </div>
              <h2 className="mt-2 text-xl font-extrabold tracking-tight text-navy">
                {score}% compliance
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {summary || "AI summary is not available yet."}
              </p>
            </div>
            <ComplianceRing score={score} status={status} size={104} />
          </div>

          <div
            className={
              isFraudFlagged
                ? "rounded-2xl border border-rose-200 bg-rose-50 p-3"
                : "rounded-2xl border border-emerald-200 bg-emerald-50 p-3"
            }
          >
            <div className="flex items-start gap-3">
              {isFraudFlagged ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-700" />
              ) : (
                <PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
              )}
              <div>
                <p className={isFraudFlagged ? "font-semibold text-rose-800" : "font-semibold text-emerald-800"}>
                  {isFraudFlagged ? "Potential fraud detected" : "No fraud detected"}
                </p>
                <p className={isFraudFlagged ? "text-sm text-rose-700" : "text-sm text-emerald-700"}>
                  {isFraudFlagged
                    ? `${fraudSignals.length} fraud signal(s) need review.`
                    : "Submission cleared current fraud checks."}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-[#d6ddea] bg-white shadow-[0_8px_28px_rgba(2,43,58,0.06)]">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <ImageIcon className="h-4 w-4 text-teal" />
          <CardTitle className="text-base text-navy">Shelf Evidence</CardTitle>
        </CardHeader>
        <CardContent>
          <ImageCompareSlider rawUrl={rawUrl} overlayUrl={overlayUrl} />
        </CardContent>
      </Card>

      <Card className="border-[#d6ddea] bg-white shadow-[0_8px_28px_rgba(2,43,58,0.06)]">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <ListChecks className="h-4 w-4 text-teal" />
          <CardTitle className="text-base text-navy">Why It Was Scored</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-3">
            {complianceReasons.map((reason, i) => (
              <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-teal/20 bg-cyan-50/80 shadow-[0_8px_28px_rgba(2,43,58,0.06)]">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <Target className="h-4 w-4 text-teal" />
          <CardTitle className="text-base text-navy">Next Best Action</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-navy/80">
            {outcome?.recommendedAction ?? "Request a revisit with clearer shelf evidence."}
          </p>
        </CardContent>
      </Card>

      <Card className="border-[#d6ddea] bg-white shadow-[0_8px_28px_rgba(2,43,58,0.06)]">
        <CardHeader className="flex flex-row items-center gap-2 pb-3">
          <Eye className="h-4 w-4 text-teal" />
          <CardTitle className="text-base text-navy">Share of Shelf</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-3 gap-2 text-center">
            <MetricPill label="Olympic" value={`${displayCounts.olympic}`} />
            <MetricPill label="Competitor" value={`${displayCounts.competitor}`} />
            <MetricPill label="Visibility" value={`${olympicShare}%`} />
          </div>
          <OlympicCompetitorChart olympic={displayCounts.olympic} competitor={displayCounts.competitor} />
          {useCountAudit && (
            <p className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
              OpenAI visual audit adjusted YOLO counts: {countAudit?.rationale}
            </p>
          )}
          <p className="rounded-2xl bg-[#eef2fb] p-3 text-xs leading-relaxed text-muted-foreground">
            Olympic visibility is {olympicShare}%; competitor presence is {Math.max(0, 100 - olympicShare)}%.
          </p>
        </CardContent>
      </Card>

      <Card className="border-[#d6ddea] bg-white shadow-[0_8px_28px_rgba(2,43,58,0.06)]">
        <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
          <div className="flex items-center gap-2">
            <PackageCheck className="h-4 w-4 text-teal" />
            <CardTitle className="text-base text-navy">POSM Review</CardTitle>
          </div>
          <Badge variant={outcome?.posm.detected ? "success" : "critical"}>
            {outcome?.posm.detected ? "Present" : "Missing"}
          </Badge>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {outcome?.posm.evidence ?? "POSM analysis not available."}
          </p>
        </CardContent>
      </Card>

      <Card className="border-[#d6ddea] bg-white shadow-[0_8px_28px_rgba(2,43,58,0.06)]">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-navy">Fraud Signals</CardTitle>
        </CardHeader>
        <CardContent>
          <FraudSignalsPanel signals={fraudSignals} />
        </CardContent>
      </Card>
    </div>
  );
}

function isCountAuditReason(reason: string): boolean {
  return reason.toLowerCase().includes("openai visual audit adjusted");
}

function MetricPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[#d6ddea] bg-[#f9f9ff] px-2 py-3">
      <p className="text-lg font-extrabold text-navy">{value}</p>
      <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}
