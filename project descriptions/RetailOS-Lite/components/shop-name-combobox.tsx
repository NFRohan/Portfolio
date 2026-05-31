"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Plus, Store } from "lucide-react";
import { AddOutletDialog, type OutletOption } from "@/components/add-outlet-dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Location = { lat: number; lng: number };

type Props = {
  value: string;
  selectedOutletId: string;
  onValueChange: (name: string) => void;
  onOutletSelect: (outlet: OutletOption | null) => void;
  gps?: Location | null;
  onLocationCaptured?: (location: Location) => void;
  isOnline?: boolean;
  disabled?: boolean;
};

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function ShopNameCombobox({
  value,
  selectedOutletId,
  onValueChange,
  onOutletSelect,
  gps,
  onLocationCaptured,
  isOnline = true,
  disabled,
}: Props) {
  const queryClient = useQueryClient();
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);

  const { data: outlets = [] } = useQuery<OutletOption[]>({
    queryKey: ["outlets"],
    queryFn: () => fetch("/api/outlets").then((r) => r.json()),
    enabled: isOnline,
    retry: false,
  });

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    const list = query
      ? outlets.filter(
          (outlet) =>
            outlet.name.toLowerCase().includes(query) || outlet.code.toLowerCase().includes(query),
        )
      : outlets;

    if (!gps) return list.slice(0, 12);

    return [...list]
      .sort((a, b) => {
        const aLat = a.latitude;
        const aLng = a.longitude;
        const bLat = b.latitude;
        const bLng = b.longitude;
        if (aLat == null || aLng == null) {
          if (bLat == null || bLng == null) return a.name.localeCompare(b.name);
          return 1;
        }
        if (bLat == null || bLng == null) return -1;
        const aDist = haversineMeters(gps.lat, gps.lng, aLat, aLng);
        const bDist = haversineMeters(gps.lat, gps.lng, bLat, bLng);
        return aDist - bDist;
      })
      .slice(0, 12);
  }, [outlets, value, gps]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function handleSelect(outlet: OutletOption) {
    onValueChange(outlet.name);
    onOutletSelect(outlet);
    setOpen(false);
  }

  function handleCreated(outlet: OutletOption) {
    queryClient.invalidateQueries({ queryKey: ["outlets"] });
    handleSelect(outlet);
    setAddOpen(false);
  }

  const showDropdown = open && !disabled && isOnline;

  return (
    <>
      <div ref={containerRef} className="relative">
        <div className="relative">
          <Store className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-teal" />
          <Input
            id="shopName"
            className="h-12 rounded-2xl bg-[#f9f9ff] pl-10"
            placeholder="Search or type store name…"
            value={value}
            disabled={disabled}
            onFocus={() => setOpen(true)}
            onChange={(event) => {
              onValueChange(event.target.value);
              onOutletSelect(null);
              setOpen(true);
            }}
            autoComplete="off"
          />
        </div>

        {showDropdown && (
          <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-[#d6ddea] bg-white shadow-lg">
            <button
              type="button"
              className="flex w-full items-center gap-2 border-b border-[#d6ddea] px-3 py-3 text-left text-sm font-medium text-navy hover:bg-[#eef2fb]"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setOpen(false);
                setAddOpen(true);
              }}
            >
              <Plus className="h-4 w-4 shrink-0 text-teal" />
              Add new store
            </button>

            <ul className="max-h-56 overflow-auto p-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-4 text-center text-sm text-muted-foreground">No stores found.</li>
              ) : (
                filtered.map((outlet) => (
                  <li key={outlet.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left text-sm hover:bg-[#eef2fb]",
                        selectedOutletId === outlet.id && "bg-[#eef2fb]",
                      )}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSelect(outlet)}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0 text-teal",
                          selectedOutletId === outlet.id ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-navy">{outlet.name}</div>
                        <div className="truncate text-xs text-muted-foreground">{outlet.code}</div>
                      </div>
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        )}
      </div>

      <AddOutletDialog
        open={addOpen && isOnline}
        onOpenChange={setAddOpen}
        defaultName={value.trim()}
        gps={gps}
        onCreated={handleCreated}
        onLocationCaptured={onLocationCaptured}
      />
    </>
  );
}
