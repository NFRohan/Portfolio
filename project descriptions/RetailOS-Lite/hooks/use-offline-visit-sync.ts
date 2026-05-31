"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listOfflineVisitSubmissions,
  OFFLINE_VISITS_CHANGED_EVENT,
  OFFLINE_VISITS_QUERY_KEY,
  syncOfflineVisitQueue,
  type OfflineVisitSubmission,
  type OfflineQueueSyncOptions,
} from "@/lib/offline-visits";

type Options = {
  autoSync?: boolean;
};

const EMPTY_OFFLINE_VISITS: OfflineVisitSubmission[] = [];

export function useOfflineVisitQueue() {
  const queryClient = useQueryClient();

  const query = useQuery<OfflineVisitSubmission[]>({
    queryKey: OFFLINE_VISITS_QUERY_KEY,
    queryFn: listOfflineVisitSubmissions,
    staleTime: 1000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: OFFLINE_VISITS_QUERY_KEY });
    };

    window.addEventListener(OFFLINE_VISITS_CHANGED_EVENT, refresh);
    window.addEventListener("online", refresh);
    window.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener(OFFLINE_VISITS_CHANGED_EVENT, refresh);
      window.removeEventListener("online", refresh);
      window.removeEventListener("visibilitychange", refresh);
    };
  }, [queryClient]);

  return query;
}

export function useOfflineVisitSync(options: Options = {}) {
  const queryClient = useQueryClient();
  const queueQuery = useOfflineVisitQueue();
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    updateOnline();
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
    };
  }, []);

  const syncMutation = useMutation({
    mutationFn: (syncOptions?: OfflineQueueSyncOptions) => syncOfflineVisitQueue(syncOptions),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: OFFLINE_VISITS_QUERY_KEY }),
        queryClient.invalidateQueries({ queryKey: ["visits"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      ]);
    },
    onError: async () => {
      await queryClient.invalidateQueries({ queryKey: OFFLINE_VISITS_QUERY_KEY });
    },
  });

  const submissions = queueQuery.data ?? EMPTY_OFFLINE_VISITS;
  const counts = useMemo(
    () => ({
      queued: submissions.filter((submission) => submission.status === "queued").length,
      syncing: submissions.filter((submission) => submission.status === "syncing").length,
      failed: submissions.filter((submission) => submission.status === "failed").length,
      total: submissions.length,
    }),
    [submissions],
  );

  useEffect(() => {
    if (!options.autoSync || !isOnline || counts.queued === 0 || syncMutation.isPending) return;
    syncMutation.mutate({ includeFailed: false });
  }, [counts.queued, isOnline, options.autoSync, syncMutation]);

  useEffect(() => {
    if (!options.autoSync) return;

    const onOnline = () => {
      if (!syncMutation.isPending) syncMutation.mutate({ includeFailed: true });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && navigator.onLine && !syncMutation.isPending) {
        syncMutation.mutate({ includeFailed: false });
      }
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [options.autoSync, syncMutation]);

  return {
    submissions,
    counts,
    isOnline,
    isLoading: queueQuery.isLoading,
    isSyncing: syncMutation.isPending || counts.syncing > 0,
    lastSyncResult: syncMutation.data,
    syncError: syncMutation.error,
    syncNow: () => syncMutation.mutate({ includeFailed: true }),
  };
}
