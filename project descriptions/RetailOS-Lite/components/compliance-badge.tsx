import { Badge } from "@/components/ui/badge";
import { cn, complianceBg } from "@/lib/utils";

export function ComplianceBadge({ score, status }: { score: number | null; status: string | null }) {
  if (score === null) return <Badge variant="outline">N/A</Badge>;
  return (
    <Badge variant="outline" className={cn("tabular-nums font-semibold", complianceBg(status ?? ""))}>
      {score}%
    </Badge>
  );
}
