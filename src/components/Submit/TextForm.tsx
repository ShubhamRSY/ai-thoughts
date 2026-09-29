"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, PenLine, X } from "lucide-react";

const MAX_CHARS = 500;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

interface TextFormProps {
  value: string;
  onChange: (v: string) => void;
  image: File | null;
  onImageChange: (file: File | null) => void;
}

export default function TextForm({ value, onChange, image, onImageChange }: TextFormProps) {
  const remaining = MAX_CHARS - value.length;
  const fileRef = useRef<HTMLInputElement>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!image) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const pickImage = (file: File | null) => {
    setImageError(null);
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setImageError("Please choose an image file.");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError("Keep the photo under 8MB.");
      return;
    }
    onImageChange(file);
  };

  return (
    <div className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)]">
      <textarea
        value={value}
        aria-label="What you feel in your own words"
        onChange={(e) => onChange(e.target.value.slice(0, MAX_CHARS))}
        placeholder="How does AI make you feel right now?"
        rows={5}
        dir="auto"
        className="w-full resize-none rounded-t-xl bg-transparent px-4 py-3 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/60 focus:outline-none"
      />

      {previewUrl && (
        <div className="relative mx-3 overflow-hidden rounded-lg border border-[var(--border-base)] bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Preview of the photo you're attaching" className="max-h-64 w-full object-contain" />
          <button
            type="button"
            onClick={() => onImageChange(null)}
            aria-label="Remove photo"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="flex items-center justify-between border-t border-[var(--border-base)] px-4 py-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
            <PenLine className="h-3.5 w-3.5" /> Clear, human, and kind
          </span>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-1 text-[11px] font-medium text-[var(--accent)] hover:text-[var(--accent-2)]"
          >
            <ImagePlus className="h-3.5 w-3.5" />
            {image ? "Change photo" : "Add photo"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
          />
        </div>
        <span
          className={`font-mono text-[11px] tabular-nums ${
            remaining < 0 ? "text-red-600" : remaining < 40 ? "text-amber-600" : "text-[var(--muted)]"
          }`}
        >
          {remaining}
        </span>
      </div>
      {imageError && <p className="px-4 pb-2 text-[11px] text-rose-700">{imageError}</p>}
    </div>
  );
}
