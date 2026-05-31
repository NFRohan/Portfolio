type Props = {
  rawUrl: string;
  overlayUrl?: string | null;
  alt?: string;
};

export function ImageCompareSlider({ rawUrl, overlayUrl, alt = "Shelf image" }: Props) {
  const displayUrl = overlayUrl || rawUrl;
  const label = overlayUrl ? "AI overlay" : "Uploaded image";

  return (
    <div className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={displayUrl} alt={overlayUrl ? `${alt} with AI overlay` : alt} className="h-full w-full object-cover" />
      <div className="pointer-events-none absolute bottom-3 right-3 rounded-md bg-black/65 px-2 py-1 text-xs font-semibold text-white">
        {label}
      </div>
    </div>
  );
}
