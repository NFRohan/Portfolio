"use client";

import { useCallback, useState } from "react";
import { Upload, X, ImageIcon } from "lucide-react";
import { cn, hashFileSha256 } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type PhotoFile = {
  file: File;
  preview: string;
  hash: string;
};

type Props = {
  photos: PhotoFile[];
  onChange: (photos: PhotoFile[]) => void;
};

export function PhotoUploader({ photos, onChange }: Props) {
  const [dragging, setDragging] = useState(false);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const file = Array.from(files).find((candidate) => candidate.type.startsWith("image/"));
      if (!file) return;

      for (const photo of photos) {
        URL.revokeObjectURL(photo.preview);
      }

      const hash = await hashFileSha256(file);
      onChange([{ file, preview: URL.createObjectURL(file), hash }]);
    },
    [photos, onChange],
  );

  const remove = (index: number) => {
    URL.revokeObjectURL(photos[index].preview);
    onChange(photos.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void addFiles(e.dataTransfer.files);
        }}
        className={cn(
          "flex flex-col items-center justify-center rounded-3xl border-2 border-dashed bg-[#f9f9ff] p-8 text-center transition-colors",
          dragging ? "border-teal bg-cyan-50" : "border-[#b9c4d8] hover:border-teal/60",
        )}
      >
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[#eef2fb] text-teal">
          <Upload className="h-7 w-7" />
        </div>
        <p className="mb-1 text-sm font-semibold text-navy">Drop one shelf photo here</p>
        <p className="mb-4 text-xs text-muted-foreground">JPG or PNG, full shelf preferred. New uploads replace the current image.</p>
        <label>
          <Button type="button" variant="outline" className="rounded-full bg-white" asChild>
            <span>{photos.length > 0 ? "Replace image" : "Browse file"}</span>
          </Button>
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => e.target.files && void addFiles(e.target.files)}
          />
        </label>
      </div>

      {photos.length > 0 && (
        <div className="grid grid-cols-1 gap-3">
          {photos.map((photo, i) => (
            <div key={photo.hash} className="group relative aspect-square overflow-hidden rounded-2xl border border-[#d6ddea]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.preview} alt="" className="h-full w-full object-cover" />
              <button
                type="button"
                onClick={() => remove(i)}
                className="absolute right-2 top-2 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="h-4 w-4" />
              </button>
              <div className="absolute bottom-0 left-0 right-0 flex items-center gap-1 bg-black/50 px-2 py-1 text-[10px] text-white">
                <ImageIcon className="h-3 w-3" />
                {photo.hash.slice(0, 8)}...
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
