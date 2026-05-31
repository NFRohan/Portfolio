"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, MapPin, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type OutletOption = {
  id: string;
  name: string;
  code: string;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
};

type Location = { lat: number; lng: number };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  gps?: Location | null;
  onCreated: (outlet: OutletOption) => void;
  onLocationCaptured?: (location: Location) => void;
};

function createCodeSuffix(): string {
  return Date.now().toString(36).slice(-4).toUpperCase();
}

function suggestCode(name: string, suffix: string): string {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 12);
  return slug ? `${slug}-${suffix}` : `OUT-${suffix}`;
}

export function AddOutletDialog({
  open,
  onOpenChange,
  defaultName = "",
  gps,
  onCreated,
  onLocationCaptured,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [address, setAddress] = useState("");
  const [location, setLocation] = useState<Location | null>(null);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [codeSuffix, setCodeSuffix] = useState(createCodeSuffix);
  const previousOpen = useRef(false);
  const suggestedCode = useMemo(() => suggestCode(name, codeSuffix), [name, codeSuffix]);

  useEffect(() => {
    if (open && !previousOpen.current) {
      setName(defaultName);
      setLocation(gps ?? null);
      setCodeSuffix(createCodeSuffix());
      setError("");
    }
    previousOpen.current = open;
  }, [open, defaultName, gps]);

  function resetForm() {
    setName("");
    setAddress("");
    setLocation(null);
    setError("");
    setCodeSuffix(createCodeSuffix());
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm();
    onOpenChange(next);
  }

  function captureLocation() {
    if (!navigator.geolocation) {
      setError("Geolocation is not supported on this device.");
      return;
    }

    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const captured = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setLocation(captured);
        onLocationCaptured?.(captured);
        setLocating(false);
      },
      () => {
        setError("Could not get GPS location. Check permissions and try again.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000 },
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Store name is required.");
      return;
    }

    if (!location) {
      setError("Store location is required. Capture GPS before saving.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/outlets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          code: suggestCode(trimmedName, codeSuffix).toUpperCase(),
          address: address.trim() || undefined,
          latitude: location.lat,
          longitude: location.lng,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to create store.");
        return;
      }

      onCreated(data);
      handleOpenChange(false);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add new store</DialogTitle>
          <DialogDescription>
            Register a store in the master list. GPS is required so future visits can be verified.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="store-name">Store name</Label>
            <Input
              id="store-name"
              placeholder="Maa Enterprise"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={submitting}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-code">Store code</Label>
            <div className="flex gap-2">
              <Input
                id="store-code"
                value={name.trim() ? suggestedCode : ""}
                readOnly
                placeholder="Auto-generated after naming the store"
                className="bg-muted/40"
              />
              <Button
                type="button"
                variant="outline"
                className="shrink-0 rounded-xl"
                onClick={() => setCodeSuffix(createCodeSuffix())}
                disabled={submitting}
                aria-label="Regenerate store code"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Generated per new store to avoid reused codes.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="store-address">Address (optional)</Label>
            <Input
              id="store-address"
              placeholder="123 Main St"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label>Store location</Label>
            <Button
              type="button"
              variant="outline"
              className="w-full rounded-xl"
              onClick={captureLocation}
              disabled={submitting || locating}
            >
              {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              {location
                ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`
                : "Capture GPS location"}
            </Button>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting || !location}>
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add store
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
