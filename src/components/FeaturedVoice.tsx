"use client";

import { Sparkles } from "lucide-react";
import FeelingBadge from "@/components/FeelingBadge";
import type { FeelingId } from "@/lib/types";

export type FeaturedVoiceData = {
  id: string;
  author: string;
  feeling: FeelingId | null;
  content: string;
};

/** One voice a human picked — keeps Voices alive even when the feed is quiet. */
export default function FeaturedVoice({ voice }: { voice: FeaturedVoiceData }) {
  return (
    <section className="app-pad mt-4" aria-label="Featured voice">
      <figure className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface-2)]/60 px-4 py-4">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
          <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
          Featured voice
        </p>
        <blockquote className="font-display mt-2 text-lg font-medium leading-snug text-[var(--foreground)]">
          “{voice.content}”
        </blockquote>
        <figcaption className="mt-3 flex items-center gap-2 text-xs text-[var(--muted)]">
          <span>{voice.author}</span>
          <FeelingBadge feeling={voice.feeling ?? undefined} size="sm" />
        </figcaption>
      </figure>
    </section>
  );
}
