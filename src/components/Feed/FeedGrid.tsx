"use client";

import type { Thought, Reaction, FeelingId } from "@/lib/types";
import FeedCard, { type ReportReason } from "@/components/Feed/FeedCard";

interface FeedGridProps {
  thoughts: Thought[];
  onReact?: (thoughtId: string, reaction: Reaction) => void | Promise<boolean>;
  onReport?: (thoughtId: string, reason: ReportReason) => void | Promise<boolean>;
  onDelete?: (thoughtId: string) => void;
  onArchive?: (thoughtId: string) => void;
  onOpenRoom?: (id: FeelingId) => void;
  onFeelWith?: (handle: string, next: boolean) => void;
  onQuoteRepost?: (postId: string, comment: string) => Promise<boolean>;
  onOpenTag?: (tag: string) => void;
  onOpenMention?: (handle: string) => void;
  onMute?: (handle: string, muted: boolean) => void | Promise<void>;
  followingHandles?: Set<string> | string[];
  currentHandle?: string | null;
  currentAuthor?: string | null;
  othersMap?: Record<string, number>;
  emptyHint?: string;
  loading?: boolean;
  focusPostId?: string | null;
}

function norm(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

export default function FeedGrid({
  thoughts,
  onReact,
  onReport,
  onDelete,
  onArchive,
  onOpenRoom,
  onFeelWith,
  onQuoteRepost,
  onOpenTag,
  onOpenMention,
  onMute,
  followingHandles,
  currentHandle,
  currentAuthor,
  othersMap,
  emptyHint,
  loading,
  focusPostId,
}: FeedGridProps) {
  const following = new Set(
    (Array.isArray(followingHandles)
      ? followingHandles
      : followingHandles
        ? Array.from(followingHandles)
        : []
    ).map(norm)
  );

  if (loading) {
    return (
      <div className="px-1 py-16 text-center">
        <p className="text-sm text-[var(--muted)]">Loading voices…</p>
      </div>
    );
  }

  if (thoughts.length === 0) {
    return (
      <div className="px-1 py-16 text-center">
        <p className="font-display text-lg text-[var(--foreground)]">Quiet for now.</p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {emptyHint ?? "Be the first to share how AI makes you feel."}
        </p>
      </div>
    );
  }

  return (
    <div className="feed-grid">
      {thoughts.map((t) => (
        <div key={t.id} id={`post-${t.id}`}>
          <FeedCard
            thought={t}
            onReact={onReact}
            onReport={onReport}
            onDelete={onDelete}
            onArchive={onArchive}
            onOpenRoom={onOpenRoom}
            onFeelWith={onFeelWith}
            onQuoteRepost={onQuoteRepost}
            onOpenTag={onOpenTag}
            onOpenMention={onOpenMention}
            onMute={onMute}
            feelingWith={following.has(norm(t.handle))}
            currentHandle={currentHandle}
            currentAuthor={currentAuthor}
            others={t.feeling ? othersMap?.[t.feeling] : undefined}
            forceChatOpen={focusPostId === t.id}
          />
        </div>
      ))}
    </div>
  );
}
