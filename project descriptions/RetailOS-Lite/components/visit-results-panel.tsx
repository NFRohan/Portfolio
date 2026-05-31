import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ComplianceRing } from "@/components/compliance-ring";
import { FraudSignalsPanel } from "@/components/fraud-signals-panel";
import { ImageCompareSlider } from "@/components/image-compare-slider";
import { OlympicCompetitorChart } from "@/components/olympic-competitor-chart";
import type { OutcomeSummary, VisitDetail } from "@/lib/types";
import { AlertTriangle, Bot, Eye, ListChecks, PackageCheck, Target } from "lucide-react";

type Props = {
  visit: VisitDetail;
  outcome: OutcomeSummary | null;
};

export function VisitResultsPanel({ visit, outcome }: Props) {
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
    visit.fraudSignals.map((s) => ({ type: s.type, severity: s.severity, message: s.message }))
  ).filter((signal) => signal.type !== "IMAGE_HASHED");
  const complianceReasons = (outcome?.complianceReasons ?? ["Analysis did not return detailed compliance reasons."]).filter(
    (reason) => !isCountAuditReason(reason),
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="space-y-6">
        <Card className="border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
          <CardContent className="p-5">
            <ImageCompareSlider rawUrl={rawUrl} overlayUrl={overlayUrl} />
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <ListChecks className="h-4 w-4 text-teal" />
              <CardTitle className="text-base text-navy">Compliance Reasons</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {complianceReasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-teal" />
                    {reason}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="border-teal/20 bg-cyan-50/70 shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
            <CardHeader className="flex flex-row items-center gap-2 pb-3">
              <Target className="h-4 w-4 text-teal" />
              <CardTitle className="text-base text-navy">Recommended Action</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed text-navy/80">
                {outcome?.recommendedAction ?? "Request a revisit with clearer shelf evidence."}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <PackageCheck className="h-4 w-4 text-teal" />
            <CardTitle className="text-base text-navy">POSM Details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <PosmDetail label="Olympic POSM" present={outcome?.posm.detected === true} />
            <p className="text-sm text-muted-foreground">
              {outcome?.posm.evidence ?? "POSM analysis not available."}
            </p>
          </CardContent>
        </Card>
      </div>

      <aside className="space-y-6">
        <HighSeverityFraudCard signals={fraudSignals} />

        <Card className="border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-3">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-teal" />
              <CardTitle className="text-base text-navy">AI Supervisor Summary</CardTitle>
            </div>
            <Badge variant={score >= 80 ? "success" : score >= 60 ? "warning" : "critical"}>{score}%</Badge>
          </CardHeader>
          <CardContent>
            <blockquote className="rounded-lg bg-[#eef2fb] p-4 text-sm leading-relaxed text-navy/80">
              &quot;{summary || "No AI summary available yet."}&quot;
            </blockquote>
          </CardContent>
        </Card>

        <Card className="border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
          <CardHeader className="flex flex-row items-center gap-2 pb-3">
            <Eye className="h-4 w-4 text-teal" />
            <CardTitle className="text-base text-navy">Share of Shelf</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center justify-center">
              <ComplianceRing score={olympicShare} status={status} size={132} />
            </div>
            <OlympicCompetitorChart olympic={displayCounts.olympic} competitor={displayCounts.competitor} />
            {useCountAudit && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed text-amber-800">
                OpenAI visual audit adjusted YOLO counts: {countAudit?.rationale}
              </div>
            )}
            <div className="rounded-lg bg-[#eef2fb] p-3 text-xs text-muted-foreground">
              Olympic visibility is {olympicShare}%; competitor presence is {Math.max(0, 100 - olympicShare)}%.
            </div>
          </CardContent>
        </Card>

        <Card className="border-[#d6ddea] bg-white shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
          <CardHeader className="pb-3">
            <CardTitle className="text-base text-navy">Fraud Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <FraudSignalsPanel signals={fraudSignals} />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function isCountAuditReason(reason: string): boolean {
  return reason.toLowerCase().includes("openai visual audit adjusted");
}

function HighSeverityFraudCard({ signals }: { signals: Array<{ type: string; severity: string; message: string }> }) {
  if (signals.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50 shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <PackageCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
            <div>
              <p className="font-semibold text-emerald-800">No fraud detected</p>
              <p className="mt-1 text-sm text-emerald-700">Submission cleared current fraud checks.</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-rose-200 bg-rose-50 shadow-[0_1px_3px_rgba(2,43,58,0.05)]">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-700" />
          <div>
            <p className="font-semibold text-rose-800">Potential Fraud</p>
            <p className="mt-1 text-sm text-rose-700">{signals.length} fraud detection signal(s) found.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PosmDetail({ label, present }: { label: string; present: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-[#d6ddea] bg-[#f9f9ff] px-3 py-2">
      <span className="text-sm font-medium text-navy">{label}</span>
      <Badge variant={present ? "success" : "critical"}>{present ? "Present" : "Missing"}</Badge>
    </div>
  );
}
