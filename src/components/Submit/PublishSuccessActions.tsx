"use client";

import { useState } from "react";
import { ImageDown, Share2 } from "lucide-react";
import type { Thought } from "@/lib/types";
import { renderThoughtCard } from "@/lib/shareCard";
import { BRAND } from "@/lib/brand";

interface PublishSuccessActionsProps {
  thought: Thought;
  compact?: boolean;
}

/** Post-publish growth moment — share your take as an image card + invite someone. */
export default function PublishSuccessActions({ thought, compact = false }: PublishSuccessActionsProps) {
  const [busy, setBusy] = useState<"card" | "invite" | null>(null);
  const [copied, setCopied] = useState(false);

  const shareCard = async () => {
    setBusy("card");
    try {
      const blob = await renderThoughtCard(thought);
      if (!blob) return;
      const file = new File([blob], `aito-${thought.id}.png`, { type: "image/png" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: BRAND.shortName });
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `aito-${thought.id}.png`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Share sheet closed or rendering failed — nothing to surface.
    } finally {
      setBusy(null);
    }
  };

  const invite = async () => {
    setBusy("invite");
    const url = typeof window !== "undefined" ? window.location.origin : "";
    const text = `I just shared how AI makes me feel on ${BRAND.shortName}. Join the conversation: ${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: BRAND.shortName, text, url });
        return;
      }
    } catch {
      /* fall through */
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  };

  const buttonBase = compact
    ? "inline-flex items-center gap-1.5 rounded-full border border-[var(--border-base)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-2)] disabled:opacity-50"
    : "inline-flex items-center gap-1.5 rounded-full border border-[var(--border-base)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--surface-2)] disabled:opacity-50";

  return (
    <div className={`flex w-full max-w-md flex-wrap items-center justify-center gap-2 ${compact ? "" : "mt-4"}`}>
      <button type="button" onClick={() => void shareCard()} disabled={busy !== null} className={buttonBase}>
        <ImageDown className="h-4 w-4 text-[var(--accent-2)]" strokeWidth={2} />
        {busy === "card" ? "Preparing…" : "Share your take"}
      </button>
      <button type="button" onClick={() => void invite()} disabled={busy !== null} className={buttonBase}>
        <Share2 className="h-4 w-4 text-[var(--accent-2)]" strokeWidth={2} />
        {busy === "invite" ? "…" : copied ? "Invite link copied" : "Invite someone"}
      </button>
    </div>
  );
}