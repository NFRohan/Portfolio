"use client";

import { Button } from "@/components/ui/button";
import { useOfflineVisitSync } from "@/hooks/use-offline-visit-sync";
import { CloudOff, Loader2, RefreshCw, Wifi } from "lucide-react";

export function OfflineSyncStatus() {
  const { counts, isOnline, isSyncing, syncNow } = useOfflineVisitSync();

  if (isOnline && counts.total === 0) return null;

  const message = !isOnline
    ? "Offline mode is active. Visits will save locally and sync when network returns."
    : isSyncing
      ? `Syncing ${counts.total} queued visit${counts.total === 1 ? "" : "s"}...`
      : counts.failed > 0
        ? `${counts.failed} visit${counts.failed === 1 ? "" : "s"} need retry.`
        : `${counts.queued} visit${counts.queued === 1 ? "" : "s"} pending sync.`;

  return (
    <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-amber-900 shadow-[0_8px_24px_rgba(2,43,58,0.05)]">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-amber-700">
          {!isOnline ? <CloudOff className="h-4 w-4" /> : isSyncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
        </div>
        <p className="flex-1 text-sm font-medium leading-snug">{message}</p>
        {isOnline && counts.total > 0 && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="shrink-0 rounded-full bg-white"
            onClick={syncNow}
            disabled={isSyncing}
          >
            <RefreshCw className={isSyncing ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}
