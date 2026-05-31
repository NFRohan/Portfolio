"use client";

export const OFFLINE_VISITS_QUERY_KEY = ["offline-visits"] as const;
export const OFFLINE_VISITS_CHANGED_EVENT = "retailos:offline-visits-changed";

const DB_NAME = "retailos-lite-offline";
const DB_VERSION = 1;
const VISIT_STORE = "visitSubmissions";
const INTERRUPTED_SYNC_AFTER_MS = 30_000;

export type OfflineVisitStatus = "queued" | "syncing" | "failed";

export type OfflineVisitPayload = {
  clientVisitId: string;
  outletName: string;
  outletId?: string;
  forceNewOutlet: boolean;
  checkInLat: number | null;
  checkInLng: number | null;
  clientTimestamp: string;
  notes: string;
};

export type OfflineVisitPhoto = {
  file: File;
  hash: string;
  name: string;
  type: string;
  size: number;
  lastModified: number;
};

export type OfflineVisitSubmission = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: OfflineVisitStatus;
  attemptCount: number;
  lastError?: string;
  payload: OfflineVisitPayload;
  photos: OfflineVisitPhoto[];
};

export type OnlineVisitSubmissionInput = {
  payload: OfflineVisitPayload;
  photos: Array<Pick<OfflineVisitPhoto, "file" | "hash" | "name" | "type" | "lastModified">>;
};

export type VisitSyncResult = {
  offlineId: string;
  visitId: string;
};

export type OfflineQueueSyncResult = {
  synced: number;
  failed: number;
  visitIds: string[];
};

export type OfflineQueueSyncOptions = {
  includeFailed?: boolean;
};

export class VisitSyncHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "VisitSyncHttpError";
  }
}

export class VisitSyncNetworkError extends Error {
  constructor(message = "Network is offline or unreachable.") {
    super(message);
    this.name = "VisitSyncNetworkError";
  }
}

let dbPromise: Promise<IDBDatabase> | null = null;

export function createClientVisitId(): string {
  return `offline_${crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2)}`}`;
}

export function isRetryableVisitSyncError(error: unknown): boolean {
  if (error instanceof VisitSyncNetworkError) return true;
  if (error instanceof VisitSyncHttpError) return error.status >= 500 || error.status === 408 || error.status === 429;
  return error instanceof TypeError;
}

export async function queueOfflineVisitSubmission(input: OnlineVisitSubmissionInput): Promise<OfflineVisitSubmission> {
  const now = new Date().toISOString();
  const submission: OfflineVisitSubmission = {
    id: input.payload.clientVisitId,
    createdAt: now,
    updatedAt: now,
    status: "queued",
    attemptCount: 0,
    payload: input.payload,
    photos: input.photos.slice(0, 1).map((photo) => ({
      file: photo.file,
      hash: photo.hash,
      name: photo.name || photo.file.name,
      type: photo.type || photo.file.type || "image/jpeg",
      size: photo.file.size,
      lastModified: photo.lastModified || photo.file.lastModified || Date.now(),
    })),
  };

  await putOfflineVisitSubmission(submission);
  emitOfflineVisitsChanged();
  return submission;
}

export async function listOfflineVisitSubmissions(): Promise<OfflineVisitSubmission[]> {
  if (!canUseIndexedDb()) return [];
  const db = await openOfflineDb();

  return new Promise((resolve, reject) => {
    const request = db.transaction(VISIT_STORE, "readonly").objectStore(VISIT_STORE).getAll();
    request.onsuccess = () => {
      resolve(
        (request.result as OfflineVisitSubmission[]).map(markInterruptedSyncForRetry).sort(
          (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
        ),
      );
    };
    request.onerror = () => reject(request.error ?? new Error("Could not read offline visit queue."));
  });
}

export async function syncOfflineVisitQueue(options: OfflineQueueSyncOptions = {}): Promise<OfflineQueueSyncResult> {
  if (!isBrowserOnline()) {
    return { synced: 0, failed: 0, visitIds: [] };
  }

  const submissions = (await listOfflineVisitSubmissions()).filter(
    (submission) => submission.status === "queued" || (options.includeFailed && submission.status === "failed"),
  );
  const result: OfflineQueueSyncResult = { synced: 0, failed: 0, visitIds: [] };

  for (const submission of submissions) {
    await putOfflineVisitSubmission({
      ...submission,
      status: "syncing",
      updatedAt: new Date().toISOString(),
      lastError: undefined,
    });
    emitOfflineVisitsChanged();

    try {
      const synced = await submitVisitOnline({
        payload: submission.payload,
        photos: submission.photos,
      });
      await deleteOfflineVisitSubmission(submission.id);
      result.synced += 1;
      result.visitIds.push(synced.visitId);
    } catch (error) {
      await putOfflineVisitSubmission({
        ...submission,
        status: "failed",
        attemptCount: submission.attemptCount + 1,
        lastError: error instanceof Error ? error.message : "Sync failed.",
        updatedAt: new Date().toISOString(),
      });
      result.failed += 1;
    } finally {
      emitOfflineVisitsChanged();
    }
  }

  return result;
}

function markInterruptedSyncForRetry(submission: OfflineVisitSubmission): OfflineVisitSubmission {
  if (submission.status !== "syncing") return submission;

  const updatedAtMs = Date.parse(submission.updatedAt);
  if (!Number.isFinite(updatedAtMs) || Date.now() - updatedAtMs < INTERRUPTED_SYNC_AFTER_MS) return submission;

  return {
    ...submission,
    status: "queued",
    lastError: "Previous sync was interrupted; retrying when online.",
  };
}

export async function submitVisitOnline(input: OnlineVisitSubmissionInput): Promise<VisitSyncResult> {
  if (!isBrowserOnline()) {
    throw new VisitSyncNetworkError();
  }

  const visit = await postJson<{ id: string; images?: Array<{ imageHash: string | null }> }>("/api/visits", {
    ...input.payload,
  });

  const uploadedHashes = new Set((visit.images ?? []).map((image) => image.imageHash).filter(Boolean));
  const photo = input.photos[0];
  if (!photo) {
    throw new VisitSyncHttpError("Upload one shelf image before submitting.", 400);
  }

  if (!uploadedHashes.has(photo.hash)) {
    await uploadVisitImage(visit.id, photo);
  }

  const submitResponse = await fetch(`/api/visits/${visit.id}/submit`, { method: "POST" });
  if (!submitResponse.ok) {
    throw await httpErrorFromResponse(submitResponse, "Failed to submit visit");
  }

  return { offlineId: input.payload.clientVisitId, visitId: visit.id };
}

function canUseIndexedDb(): boolean {
  return typeof window !== "undefined" && "indexedDB" in window;
}

function isBrowserOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function emitOfflineVisitsChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OFFLINE_VISITS_CHANGED_EVENT));
  }
}

async function openOfflineDb(): Promise<IDBDatabase> {
  if (!canUseIndexedDb()) {
    throw new Error("IndexedDB is not available in this browser.");
  }

  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VISIT_STORE)) {
        const store = db.createObjectStore(VISIT_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
        store.createIndex("status", "status");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open IndexedDB."));
  });

  return dbPromise;
}

async function putOfflineVisitSubmission(submission: OfflineVisitSubmission): Promise<void> {
  const db = await openOfflineDb();

  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(VISIT_STORE, "readwrite").objectStore(VISIT_STORE).put(submission);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not save offline visit."));
  });
}

async function deleteOfflineVisitSubmission(id: string): Promise<void> {
  const db = await openOfflineDb();

  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(VISIT_STORE, "readwrite").objectStore(VISIT_STORE).delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("Could not delete offline visit."));
  });
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw await httpErrorFromResponse(response, "Request failed");
  }

  return response.json() as Promise<T>;
}

async function httpErrorFromResponse(response: Response, fallback: string): Promise<VisitSyncHttpError> {
  const body = await response.json().catch(() => null);
  return new VisitSyncHttpError(body?.error ?? fallback, response.status);
}

async function uploadVisitImage(
  visitId: string,
  photo: Pick<OfflineVisitPhoto, "file" | "hash" | "name" | "type" | "lastModified">,
): Promise<void> {
  const file = fileForUpload(photo);
  const presignResponse = await fetch(`/api/visits/${visitId}/images/presign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fileName: photo.name || file.name,
      contentType: photo.type || file.type || "image/jpeg",
      sizeBytes: file.size,
      imageHash: photo.hash,
    }),
  });

  if (presignResponse.status === 501) {
    await uploadVisitImageViaMultipart(visitId, photo);
    return;
  }
  if (!presignResponse.ok) {
    throw await httpErrorFromResponse(presignResponse, "Failed to prepare image upload");
  }

  const signed = (await presignResponse.json()) as {
    uploadUrl: string;
    headers?: Record<string, string>;
    storageKey: string;
  };
  const uploadResponse = await fetch(signed.uploadUrl, {
    method: "PUT",
    headers: signed.headers ?? { "Content-Type": photo.type || file.type || "image/jpeg" },
    body: file,
  });
  if (!uploadResponse.ok) {
    throw new VisitSyncHttpError("Failed to upload image to object storage", uploadResponse.status);
  }

  const completeResponse = await fetch(`/api/visits/${visitId}/images/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      storageKey: signed.storageKey,
      imageHash: photo.hash,
      contentType: photo.type || file.type || "image/jpeg",
      sizeBytes: file.size,
    }),
  });
  if (!completeResponse.ok) {
    throw await httpErrorFromResponse(completeResponse, "Failed to complete image upload");
  }
}

async function uploadVisitImageViaMultipart(
  visitId: string,
  photo: Pick<OfflineVisitPhoto, "file" | "hash" | "name" | "type" | "lastModified">,
): Promise<void> {
  const form = new FormData();
  form.append("file", fileForUpload(photo));
  form.append("imageHash", photo.hash);

  const imageResponse = await fetch(`/api/visits/${visitId}/images`, { method: "POST", body: form });
  if (!imageResponse.ok) {
    throw await httpErrorFromResponse(imageResponse, "Failed to upload image");
  }
}

function fileForUpload(photo: Pick<OfflineVisitPhoto, "file" | "name" | "type" | "lastModified">): File {
  if (photo.file instanceof File) return photo.file;
  return new File([photo.file], photo.name, {
    type: photo.type,
    lastModified: photo.lastModified,
  });
}
