import { Badge } from "@/components/ui/badge";
import type { VisitStatus } from "@prisma/client";
import { Loader2 } from "lucide-react";

const config: Record<VisitStatus, { label: string; variant: "default" | "secondary" | "success" | "warning" | "critical" | "outline" | "destructive" }> = {
  PENDING: { label: "Pending", variant: "outline" },
  ANALYZING: { label: "Analyzing", variant: "warning" },
  COMPLETE: { label: "Complete", variant: "success" },
  FLAGGED: { label: "Flagged", variant: "critical" },
  FAILED: { label: "Failed", variant: "destructive" as "critical" },
};

export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  const { label, variant } = config[status];
  return (
    <Badge variant={variant} className="gap-1">
      {status === "ANALYZING" && <Loader2 className="h-3 w-3 animate-spin" />}
      {label}
    </Badge>
  );
}
