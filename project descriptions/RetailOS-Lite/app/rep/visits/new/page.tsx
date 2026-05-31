"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PhotoUploader, type PhotoFile } from "@/components/photo-uploader";
import { ShopNameCombobox } from "@/components/shop-name-combobox";
import type { OutletOption } from "@/components/add-outlet-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  createClientVisitId,
  isRetryableVisitSyncError,
  queueOfflineVisitSubmission,
  submitVisitOnline,
  type OfflineVisitPayload,
} from "@/lib/offline-visits";
import { cn } from "@/lib/utils";
import { Camera, Check, ChevronLeft, CloudOff, Loader2, MapPin, Search, ShieldCheck, Store, X } from "lucide-react";

const STEPS = ["Outlet", "Photos", "Review"];

type OutletSearchCandidate = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  distanceMeters: number;
  confidence: number;
  visitCount: number;
};

type OutletSearchResponse = {
  candidates: OutletSearchCandidate[];
  autoMatch: OutletSearchCandidate | null;
  radiusMeters: number;
};

export default function NewVisitPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);
  const [shopName, setShopName] = useState("");
  const [selectedOutletId, setSelectedOutletId] = useState("");
  const [selectedOutlet, setSelectedOutlet] = useState<OutletOption | null>(null);
  const [forceNewOutlet, setForceNewOutlet] = useState(false);
  const [notes, setNotes] = useState("");
  const [gps, setGps] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [photos, setPhotos] = useState<PhotoFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [isOnline, setIsOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine));
  const [error, setError] = useState("");
  const [queuedOfflineMessage, setQueuedOfflineMessage] = useState("");

  const normalizedShopName = shopName.trim();
  const canSearchOutlets = Boolean(isOnline && normalizedShopName.length >= 2 && gps);
  const submitMutation = useMutation({ mutationFn: submitVisitOnline });
  const { data: outletSearch, isFetching: searchingOutlets } = useQuery<OutletSearchResponse>({
    queryKey: ["outlet-search", normalizedShopName, gps?.lat.toFixed(5), gps?.lng.toFixed(5)],
    enabled: canSearchOutlets,
    queryFn: async () => {
      const response = await fetch("/api/outlets/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: normalizedShopName,
          lat: gps?.lat,
          lng: gps?.lng,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Could not search nearby outlets.");
      }
      return response.json();
    },
  });

  useEffect(() => {
    setSelectedOutletId("");
    setSelectedOutlet(null);
    setForceNewOutlet(false);
  }, [gps?.lat, gps?.lng]);

  useEffect(() => {
    if (selectedOutlet && normalizedShopName === selectedOutlet.name.trim()) return;
    setSelectedOutletId("");
    setSelectedOutlet(null);
    setForceNewOutlet(false);
  }, [normalizedShopName, selectedOutlet]);

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

  useEffect(() => {
    if (outletSearch?.autoMatch && !selectedOutletId) {
      setSelectedOutletId(outletSearch.autoMatch.id);
      setShopName(outletSearch.autoMatch.name);
      setSelectedOutlet({
        id: outletSearch.autoMatch.id,
        name: outletSearch.autoMatch.name,
        code: outletSearch.autoMatch.code,
        address: outletSearch.autoMatch.address,
      });
      setForceNewOutlet(false);
    }
  }, [outletSearch?.autoMatch, selectedOutletId]);

  function handleOutletSelect(outlet: OutletOption | null) {
    setSelectedOutlet(outlet);
    if (outlet) {
      setSelectedOutletId(outlet.id);
      setForceNewOutlet(false);
    } else {
      setSelectedOutletId("");
    }
  }

  function captureGps() {
    setError("");
    if (!("geolocation" in navigator)) {
      setError("GPS is not available on this device.");
      return;
    }

    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsLoading(false);
      },
      () => {
        setError("Could not get GPS location.");
        setGpsLoading(false);
      },
    );
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    setQueuedOfflineMessage("");
    const resolvedOutletId = selectedOutletId || selectedOutlet?.id || undefined;
    const shouldForceNewOutlet = isOnline && forceNewOutlet && !resolvedOutletId;
    const payload: OfflineVisitPayload = {
      clientVisitId: createClientVisitId(),
      outletName: normalizedShopName,
      outletId: resolvedOutletId,
      forceNewOutlet: shouldForceNewOutlet,
      checkInLat: gps?.lat ?? null,
      checkInLng: gps?.lng ?? null,
      clientTimestamp: new Date().toISOString(),
      notes,
    };
    const syncInput = {
      payload,
      photos: photos.slice(0, 1).map((photo) => ({
        file: photo.file,
        hash: photo.hash,
        name: photo.file.name,
        type: photo.file.type,
        lastModified: photo.file.lastModified,
      })),
    };

    try {
      if (!isOnline) {
        await queueOfflineVisitSubmission(syncInput);
        await queryClient.invalidateQueries({ queryKey: ["offline-visits"] });
        setQueuedOfflineMessage("Saved offline. Keep this tab open or reconnect later; sync will retry automatically.");
        setSubmitting(false);
        return;
      }

      const result = await submitMutation.mutateAsync(syncInput);
      await queryClient.invalidateQueries({ queryKey: ["visits"] });
      router.push(`/rep/visits/${result.visitId}`);
    } catch (err) {
      if (isRetryableVisitSyncError(err)) {
        try {
          await queueOfflineVisitSubmission(syncInput);
          await queryClient.invalidateQueries({ queryKey: ["offline-visits"] });
          setQueuedOfflineMessage("Saved offline after a network failure. Sync will retry automatically when the app is online.");
          setSubmitting(false);
          return;
        } catch (queueError) {
          setError(queueError instanceof Error ? queueError.message : "Could not save visit offline.");
        }
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    }

    setSubmitting(false);
  }

  const suggestions = outletSearch?.candidates ?? [];
  const selectedCandidate =
    suggestions.find((candidate) => candidate.id === selectedOutletId) ??
    (selectedOutlet
      ? {
          id: selectedOutlet.id,
          name: selectedOutlet.name,
          code: selectedOutlet.code,
          address: selectedOutlet.address ?? null,
          distanceMeters: 0,
          confidence: 1,
          visitCount: 0,
        }
      : null);
  const canCreateImplicitly = Boolean(
    (outletSearch && suggestions.length === 0 && !searchingOutlets) ||
      (!isOnline && normalizedShopName.length >= 2 && gps),
  );
  const canContinueFromOutlet = Boolean(
    normalizedShopName.length >= 2 && gps && (selectedOutletId || forceNewOutlet || canCreateImplicitly),
  );
  const outletMatchReviewLabel = selectedCandidate
    ? `${selectedCandidate.name} (${Math.round(selectedCandidate.confidence * 100)}%)`
    : !isOnline
      ? "Will resolve against master outlet data when synced"
      : forceNewOutlet
        ? "New shop pending supervisor review"
        : "Server will resolve nearest outlet match";

  return (
    <div className="space-y-5">
      <header className="flex items-start justify-between gap-4">
        <div>
          <Link href="/rep/visits" className="mb-4 inline-flex items-center text-sm font-semibold text-muted-foreground">
            <ChevronLeft className="mr-1 h-4 w-4" />
            Visits
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight text-navy">New Visit</h1>
          <p className="mt-1 text-sm text-muted-foreground">Capture outlet proof for AI shelf analysis.</p>
        </div>
        <Button variant="outline" size="icon" className="rounded-full bg-white" asChild>
          <Link href="/rep/visits" aria-label="Close new visit">
            <X className="h-4 w-4" />
          </Link>
        </Button>
      </header>

      <WizardStepper step={step} />

      {step === 0 && (
        <Card className="border-[#d6ddea] bg-white shadow-[0_12px_32px_rgba(2,43,58,0.08)]">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-navy">Outlet Check-In</CardTitle>
            <p className="text-sm text-muted-foreground">Capture the shop name and GPS before uploading shelf images.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="space-y-2">
              <Label className="text-navy" htmlFor="shopName">
                Shop Name
              </Label>
              <ShopNameCombobox
                value={shopName}
                selectedOutletId={selectedOutletId}
                onValueChange={setShopName}
                onOutletSelect={handleOutletSelect}
                gps={gps}
                onLocationCaptured={setGps}
                isOnline={isOnline}
              />
              <p className="text-xs text-muted-foreground">
                {isOnline
                  ? "Pick a store from the list or type a new one. Nearby GPS matching runs as you type."
                  : "Offline: type the shop name manually. Matching and supervisor verification run when the visit syncs."}
              </p>
            </div>

            <div
              className={cn(
                "rounded-2xl border p-4 transition-colors",
                gps ? "border-emerald-200 bg-emerald-50" : "border-[#d6ddea] bg-[#f9f9ff]",
              )}
            >
              <div className="flex items-start gap-3">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                    gps ? "bg-emerald-600 text-white" : "bg-[#eef2fb] text-teal",
                  )}
                >
                  {gps ? <Check className="h-5 w-5" /> : <MapPin className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-navy">Location Verification</p>
                    {gps && (
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">
                        Verified
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {gps
                      ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}`
                      : "Capture GPS to prove the rep was at the outlet."}
                  </p>
                  <Button
                    type="button"
                    variant={gps ? "outline" : "default"}
                    className="mt-4 w-full rounded-xl"
                    onClick={captureGps}
                    disabled={gpsLoading}
                  >
                    {gpsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
                    {gps ? "Refresh GPS" : "Capture GPS"}
                  </Button>
                </div>
              </div>
            </div>

            {!selectedOutletId && (
              <OutletMatchPanel
                autoMatch={outletSearch?.autoMatch ?? null}
                forceNewOutlet={forceNewOutlet}
                gpsCaptured={Boolean(gps)}
                isOnline={isOnline}
                isLoading={searchingOutlets}
                onCreateNew={() => {
                  setSelectedOutletId("");
                  setForceNewOutlet(true);
                }}
                onSelect={(candidateId) => {
                  const candidate = suggestions.find((item) => item.id === candidateId);
                  if (candidate) {
                    setShopName(candidate.name);
                    setSelectedOutlet({
                      id: candidate.id,
                      name: candidate.name,
                      code: candidate.code,
                      address: candidate.address,
                    });
                  }
                  setSelectedOutletId(candidateId);
                  setForceNewOutlet(false);
                }}
                radiusMeters={outletSearch?.radiusMeters ?? 100}
                searchReady={canSearchOutlets}
                selectedOutletId={selectedOutletId}
                shopName={normalizedShopName}
                suggestions={suggestions}
              />
            )}

            {selectedOutletId && selectedCandidate && (
              <div className="rounded-2xl border border-teal/30 bg-teal/5 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal text-white">
                    <Store className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-semibold text-navy">Store selected</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {selectedCandidate.name} ({selectedCandidate.code})
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label className="text-navy">Visit Notes</Label>
              <Textarea
                className="min-h-24 rounded-2xl bg-[#f9f9ff]"
                placeholder="Shelf near front counter, POSM visible near aisle..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            <Button type="button" className="h-12 w-full rounded-2xl" disabled={!canContinueFromOutlet} onClick={() => setStep(1)}>
              Continue to Photos
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card className="border-[#d6ddea] bg-white shadow-[0_12px_32px_rgba(2,43,58,0.08)]">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-navy">Shelf Evidence</CardTitle>
            <p className="text-sm text-muted-foreground">Upload one full-shelf image with any POSM material in frame.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-teal/20 bg-cyan-50/70 p-4">
              <div className="flex items-start gap-3">
                <Camera className="mt-0.5 h-5 w-5 text-teal" />
                <div>
                  <p className="font-semibold text-navy">Photo checklist</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Capture Olympic packs, competitor packs, shelf rows, and visible POSM in a single frame.
                  </p>
                </div>
              </div>
            </div>

            <PhotoUploader photos={photos} onChange={setPhotos} />

            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="outline" className="h-12 rounded-2xl" onClick={() => setStep(0)}>
                Back
              </Button>
              <Button type="button" className="h-12 rounded-2xl" disabled={photos.length === 0} onClick={() => setStep(2)}>
                Review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card className="border-[#d6ddea] bg-white shadow-[0_12px_32px_rgba(2,43,58,0.08)]">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg text-navy">Review Submission</CardTitle>
            <p className="text-sm text-muted-foreground">AI analysis starts as soon as this visit is submitted.</p>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="rounded-2xl border border-[#d6ddea] bg-[#f9f9ff] p-4">
              <dl className="space-y-3 text-sm">
                <ReviewRow label="Shop" value={normalizedShopName || "-"} />
                <ReviewRow
                  label="Outlet Match"
                  value={outletMatchReviewLabel}
                />
                <ReviewRow label="GPS" value={gps ? `${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)}` : "Not captured"} />
                <ReviewRow label="Image" value={photos.length > 0 ? "1 shelf image" : "Not uploaded"} />
                <ReviewRow label="Notes" value={notes || "No notes added"} />
              </dl>
            </div>

            <div className="rounded-2xl border border-teal/20 bg-cyan-50/70 p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-teal" />
                <p className="text-sm text-muted-foreground">
                  This will run YOLO shelf detection, POSM LLM review, compliance scoring, and fraud checks.
                  {!isOnline && " Because you are offline, the visit will queue locally first."}
                </p>
              </div>
            </div>

            {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
            {queuedOfflineMessage && (
              <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
                {queuedOfflineMessage}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <Button type="button" variant="outline" className="h-12 rounded-2xl" onClick={() => setStep(1)} disabled={submitting}>
                Back
              </Button>
              <Button
                type="button"
                className="h-12 rounded-2xl"
                onClick={handleSubmit}
                disabled={submitting || Boolean(queuedOfflineMessage)}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {isOnline ? "Submitting..." : "Saving..."}
                  </>
                ) : (
                  isOnline ? "Submit Visit" : "Save Offline"
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function OutletMatchPanel({
  autoMatch,
  forceNewOutlet,
  gpsCaptured,
  isOnline,
  isLoading,
  onCreateNew,
  onSelect,
  radiusMeters,
  searchReady,
  selectedOutletId,
  shopName,
  suggestions,
}: {
  autoMatch: OutletSearchCandidate | null;
  forceNewOutlet: boolean;
  gpsCaptured: boolean;
  isOnline: boolean;
  isLoading: boolean;
  onCreateNew: () => void;
  onSelect: (candidateId: string) => void;
  radiusMeters: number;
  searchReady: boolean;
  selectedOutletId: string;
  shopName: string;
  suggestions: OutletSearchCandidate[];
}) {
  if (!gpsCaptured) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d6ddea] bg-[#f9f9ff] p-4 text-sm text-muted-foreground">
        Capture GPS to search the nearby outlet registry.
      </div>
    );
  }

  if (shopName.length < 2) {
    return (
      <div className="rounded-2xl border border-dashed border-[#d6ddea] bg-[#f9f9ff] p-4 text-sm text-muted-foreground">
        Enter at least 2 characters to search nearby shops.
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-amber-700">
            <CloudOff className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-950">Offline outlet capture</p>
            <p className="mt-1 text-sm text-amber-800">
              Save the typed shop name and GPS now. The server will match it to existing outlet data when this visit syncs.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-amber-300 bg-white/80 p-3 text-sm text-amber-900">
          <span className="font-semibold">{shopName}</span> will be queued as an unresolved outlet claim. If no confident
          nearby match exists during sync, it will become a supervisor-reviewed new outlet.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[#d6ddea] bg-[#f9f9ff] p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef2fb] text-teal">
          {isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-navy">Nearby Outlet Match</p>
            <Badge variant={autoMatch ? "success" : "outline"} className="bg-white">
              {autoMatch ? "Auto-match ready" : `${radiusMeters}m GPS scope`}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            We only show candidates near your current GPS. If the shop is unknown, submit it as a new pending outlet.
          </p>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Searching nearby master data...</p>}

      {!isLoading && searchReady && suggestions.length === 0 && (
        <div className="space-y-2">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            No nearby match found. This visit can continue as a new pending outlet for supervisor review.
          </div>
          <button
            type="button"
            className={cn(
              "w-full rounded-xl border border-dashed p-3 text-left text-sm transition-colors",
              forceNewOutlet
                ? "border-amber-400 bg-amber-50 text-amber-900"
                : "border-[#c1c7cc] bg-white text-muted-foreground hover:border-amber-400 hover:bg-amber-50",
            )}
            onClick={onCreateNew}
          >
            Submit <span className="font-semibold">{shopName}</span> as a new pending outlet.
          </button>
        </div>
      )}

      {!isLoading && suggestions.length > 0 && (
        <div className="space-y-2">
          {suggestions.map((candidate) => {
            const selected = selectedOutletId === candidate.id;
            return (
              <button
                key={candidate.id}
                type="button"
                className={cn(
                  "w-full rounded-xl border bg-white p-3 text-left transition-colors",
                  selected ? "border-teal ring-2 ring-teal/15" : "border-[#d6ddea] hover:border-teal/60",
                )}
                onClick={() => onSelect(candidate.id)}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-teal" />
                      <p className="font-semibold text-navy">{candidate.name}</p>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {candidate.code} • {candidate.distanceMeters}m away • {candidate.visitCount} visit
                      {candidate.visitCount === 1 ? "" : "s"}
                    </p>
                    {candidate.address && <p className="mt-1 text-xs text-muted-foreground">{candidate.address}</p>}
                  </div>
                  <Badge variant={candidate.confidence >= 0.9 ? "success" : "warning"}>
                    {Math.round(candidate.confidence * 100)}%
                  </Badge>
                </div>
              </button>
            );
          })}

          <button
            type="button"
            className={cn(
              "w-full rounded-xl border border-dashed p-3 text-left text-sm transition-colors",
              forceNewOutlet
                ? "border-amber-400 bg-amber-50 text-amber-900"
                : "border-[#c1c7cc] bg-white text-muted-foreground hover:border-amber-400 hover:bg-amber-50",
            )}
            onClick={onCreateNew}
          >
            This is not the right shop. Submit <span className="font-semibold">{shopName}</span> as a new pending outlet.
          </button>
        </div>
      )}
    </div>
  );
}

function WizardStepper({ step }: { step: number }) {
  return (
    <div className="rounded-3xl border border-[#d6ddea] bg-white p-4 shadow-[0_8px_28px_rgba(2,43,58,0.06)]">
      <div className="flex items-center">
        {STEPS.map((label, i) => (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-2">
              <div
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-colors",
                  i <= step ? "bg-teal text-white shadow-sm" : "bg-[#eef2fb] text-muted-foreground",
                )}
              >
                {i < step ? <Check className="h-4 w-4" /> : i + 1}
              </div>
              <span className={cn("text-xs font-semibold", i <= step ? "text-navy" : "text-muted-foreground")}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className={cn("mx-2 h-1 flex-1 rounded-full", i < step ? "bg-teal" : "bg-[#d6ddea]")} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="max-w-[65%] text-right font-semibold text-navy">{value}</dd>
    </div>
  );
}
