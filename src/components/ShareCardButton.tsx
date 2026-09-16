"use client";

import { useState } from "react";
import { ImageDown } from "lucide-react";
import type { Thought } from "@/lib/types";
import { renderThoughtCard } from "@/lib/shareCard";

export default function ShareCardButton({ thought }: { thought: Thought }) {
  const [busy, setBusy] = useState(false);

  const share = async () => {
    setBusy(true);
    try {
      const blob = await renderThoughtCard(thought);
      if (!blob) return;
      const file = new File([blob], `aito-${thought.id}.png`, { type: "image/png" });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "AiTo" });
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aito-${thought.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Share sheet cancelled, or rendering failed — nothing to surface.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={() => void share()}
      disabled={busy}
      aria-label="Share as card"
      title="Share as card"
      className="flex items-center gap-1.5 text-[13px] font-medium transition hover:text-[var(--foreground)] disabled:opacity-50"
    >
      <ImageDown className="h-[18px] w-[18px]" strokeWidth={2} />
    </button>
  );
}
