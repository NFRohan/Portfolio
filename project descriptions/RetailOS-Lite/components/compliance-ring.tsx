"use client";

import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect } from "react";
import { cn, complianceColor } from "@/lib/utils";

type Props = {
  score: number;
  status: string;
  size?: number;
};

export function ComplianceRing({ score, status, size = 160 }: Props) {
  const spring = useSpring(0, { stiffness: 60, damping: 20 });
  const display = useTransform(spring, (v) => Math.round(v));

  useEffect(() => {
    spring.set(score);
  }, [score, spring]);

  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const isCompact = size <= 120;

  const strokeColor =
    status === "excellent" || status === "acceptable"
      ? "#10B981"
      : status === "poor"
        ? "#F59E0B"
        : "#F43F5E";

  return (
    <div className="relative inline-flex flex-col items-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          className="text-muted/30"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-3 text-center leading-none">
        <motion.span className={cn("font-bold tabular-nums text-navy", isCompact ? "text-2xl" : "text-3xl")}>
          {display}
        </motion.span>
        <span
          className={cn(
            "mt-1 max-w-full truncate font-medium uppercase",
            isCompact ? "text-[10px] tracking-[0.08em]" : "text-xs tracking-wide",
            complianceColor(status),
          )}
        >
          {status}
        </span>
      </div>
    </div>
  );
}
