import { Quote } from "lucide-react";

export function SupervisorSummaryCard({ summary }: { summary: string }) {
  return (
    <div className="relative rounded-xl border border-gold/20 bg-gradient-to-br from-gold/5 to-transparent p-6 pl-8">
      <div className="absolute left-0 top-4 bottom-4 w-1 rounded-full bg-gold" />
      <Quote className="mb-2 h-5 w-5 text-gold/60" />
      <p className="text-lg font-medium leading-relaxed text-foreground md:text-xl">{summary}</p>
    </div>
  );
}
