"use client";

import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { id: "upload", label: "Upload" },
  { id: "fraud", label: "Fraud checks" },
  { id: "yolo", label: "YOLO detection" },
  { id: "compliance", label: "Compliance" },
  { id: "summary", label: "AI summary" },
];

export function AnalyzingPipeline({ activeStep = 2 }: { activeStep?: number }) {
  return (
    <div className="rounded-3xl border border-teal/20 bg-cyan-50/70 p-5 shadow-[0_8px_28px_rgba(2,43,58,0.06)]">
      <p className="mb-4 text-sm font-semibold text-navy">AI pipeline running...</p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {STEPS.map((step, i) => {
          const done = i < activeStep;
          const active = i === activeStep;
          return (
            <div key={step.id} className="flex items-center gap-2 sm:flex-col sm:gap-1">
              <motion.div
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold",
                  done && "border-emerald-600 bg-emerald-600 text-white",
                  active && "border-teal bg-teal/10 text-teal animate-pulse-ring",
                  !done && !active && "border-[#b9c4d8] bg-white text-muted-foreground",
                )}
                animate={active ? { scale: [1, 1.05, 1] } : {}}
                transition={{ repeat: Infinity, duration: 2 }}
              >
                {done ? <Check className="h-4 w-4" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : i + 1}
              </motion.div>
              <span className={cn("text-xs", active ? "font-semibold text-teal" : "text-muted-foreground")}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
