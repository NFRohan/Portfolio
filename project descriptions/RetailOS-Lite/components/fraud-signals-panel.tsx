import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Copy, Clock, MapPin, Hash } from "lucide-react";

type Signal = { type: string; severity: string; message: string };

const iconFor = (type: string) => {
  if (type.includes("DUPLICATE")) return Copy;
  if (type.includes("GPS")) return MapPin;
  if (type.includes("TIMESTAMP")) return Clock;
  if (type.includes("HASH")) return Hash;
  return AlertTriangle;
};

const severityVariant = (severity: string) => {
  if (severity === "HIGH") return "critical" as const;
  if (severity === "MEDIUM") return "warning" as const;
  return "secondary" as const;
};

export function FraudSignalsPanel({ signals }: { signals: Signal[] }) {
  if (signals.length === 0) {
    return (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-400">
        No fraud signals detected for this visit.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {signals.map((signal, i) => {
        const Icon = iconFor(signal.type);
        return (
          <div
            key={`${signal.type}-${i}`}
            className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-3"
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={severityVariant(signal.severity)}>{signal.type.replace(/_/g, " ")}</Badge>
                <span className="text-xs text-muted-foreground">{signal.severity}</span>
              </div>
              <p className="text-sm text-foreground/90">{signal.message}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
