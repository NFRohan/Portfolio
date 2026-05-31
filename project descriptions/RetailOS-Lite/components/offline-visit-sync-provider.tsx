"use client";

import { useOfflineVisitSync } from "@/hooks/use-offline-visit-sync";

export function OfflineVisitSyncProvider({ children }: { children?: React.ReactNode }) {
  useOfflineVisitSync({ autoSync: true });
  return children ? <>{children}</> : null;
}
