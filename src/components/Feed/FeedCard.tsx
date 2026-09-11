"use client";

import { useRef, useState } from "react";
import {
  MessageCircle,
  Heart,
  Bookmark,
  MoreHorizontal,
  Flag,
  ShieldCheck,
  Trash2,
  HeartHandshake,
} from "lucide-react";
import type { Thought, Reaction, FeelingId } from "@/lib/types";
import { REACTION_TYPES } from "@/lib/mock-data";
import AudioPlayer from "@/components/Player/AudioPlayer";
import VideoPlayer from "@/components/Player/VideoPlayer";
import IntegrityBadge from "@/components/IntegrityBadge";
import TranscriptPanel from "@/components/Feed/TranscriptPanel";
import FeelingBadge from "@/components/FeelingBadge";
import ChatPanel from "@/components/Chat/ChatPanel";
import TranslateToEnglish from "@/components/TranslateToEnglish";
import { shouldOfferTranslate } from "@/lib/lang";

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export type ReportReason =
  | "Hate or harassment"
  | "Unsafe or explicit"
  | "Spam or fake"
  | "Harms someone";

interface FeedCardProps {
  thought: Thought;
  onReact?: (thoughtId: string, reaction: Reaction) => void;
  onReport?: (thoughtId: string, reason: ReportReason) => void;
  onDelete?: (thoughtId: string) => void;
  onOpenRoom?: (id: FeelingId) => void;
  onFeelWith?: (handle: string, next: boolean) => void;
  feelingWith?: boolean;
  /** Signed-in handle — only this author sees Delete on their take. */
  currentHandle?: string | null;
  others?: number;
}

function sameHandle(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  return a.trim().toLowerCase().replace(/^@/, "") === b.trim().toLowerCase().replace(/^@/, "");
}

const REPORT_REASONS: ReportReason[] = [
  "Hate or harassment",
  "Unsafe or explicit",
  "Spam or fake",
  "Harms someone",
];

export default function FeedCard({
  thought,
  onReact,
  onReport,
  onDelete,
  onOpenRoom,
  onFeelWith,
  feelingWith,
  currentHandle,
  others,
}: FeedCardProps) {
  const [reactions, setReactions] = useState(thought.reactions);
  const [mine, setMine] = useState<Reaction | null>(null);
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(
    thought.reactions.reduce((s, e) => s + e.count, 0) + 12
  );
  const [saved, setSaved] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [commentCount, setCommentCount] = useState<number | null>(null);
  const [showReact, setShowReact] = useState(false);
  const [feeling, setFeeling] = useState(Boolean(feelingWith));
  const isAuthor = sameHandle(currentHandle, thought.handle);
  // Prefer prop when parent knows follow state; fall back to optimistic local toggle.
  const feelingActive = feelingWith !== undefined ? Boolean(feelingWith) : feeling;

  const mediaElRef = useRef<HTMLMediaElement | null>(null);
  const [mediaTime, setMediaTime] = useState(0);
  const hasTranscript = Boolean(
    (thought.mediaType === "audio" || thought.mediaType === "video") && thought.transcript?.length
  );
  const mediaSrc = thought.streamReady && thought.streamUrl ? thought.streamUrl : thought.mediaUrl;

  const react = (r: Reaction) => {
    if (mine === r) {
      setReactions((prev) =>
        prev.map((e) => (e.type === r ? { ...e, count: Math.max(0, e.count - 1) } : e))
      );
      setMine(null);
      return;
    }
    setReactions((prev) =>
      prev.map((e) => {
        if (e.type === r) return { ...e, count: e.count + 1 };
        if (mine && e.type === mine) return { ...e, count: Math.max(0, e.count - 1) };
        return e;
      })
    );
    setMine(r);
    onReact?.(thought.id, r);
  };

  const like = () => {
    setLiked((v) => {
      setLikes((n) => n + (v ? -1 : 1));
      return !v;
    });
  };

  const seekTo = (t: number) => {
    const el = mediaElRef.current;
    if (!el) return;
    el.currentTime = t;
    el.play().catch(() => {});
  };

  return (
    <article className="relative isolate border-b border-[var(--border-base)] bg-[var(--surface)] py-5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[11px] font-semibold text-[var(--foreground)]">
          {initials(thought.author)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--foreground)]">
              {thought.author}
            </span>
            <span className="shrink-0 text-xs text-[var(--muted)]">{thought.timeLabel}</span>
            <div className="relative ml-auto shrink-0">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label="More"
                className="rounded-md p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
              {menuOpen && (
                <>
                  <button
                    type="button"
                    className="fixed inset-0 z-10 cursor-default"
                    aria-label="Close menu"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 top-7 z-20 w-44 overflow-hidden rounded-lg border border-[var(--border-base)] bg-[var(--surface)] shadow-md">
                    {isAuthor && onDelete && (
                      <button
                        type="button"
                        disabled={deleting}
                        onClick={() => {
                          if (
                            !window.confirm(
                              "Delete this take? It will be removed for everyone."
                            )
                          ) {
                            setMenuOpen(false);
                            return;
                          }
                          setDeleting(true);
                          setMenuOpen(false);
                          onDelete(thought.id);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-rose-700 hover:bg-[var(--surface-2)] disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {deleting ? "Deleting…" : "Delete take"}
                      </button>
                    )}
                    {!isAuthor && currentHandle && onFeelWith && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = !feelingActive;
                          setFeeling(next);
                          setMenuOpen(false);
                          onFeelWith(thought.handle, next);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-2)]"
                      >
                        <HeartHandshake className="h-3.5 w-3.5" />
                        {feelingActive ? "Stop feeling with" : "Feel with"}
                      </button>
                    )}
                    {!isAuthor && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          setReporting(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-2)]"
                      >
                        <Flag className="h-3.5 w-3.5" />
                        Report
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--muted)]">
            <FeelingBadge feeling={thought.feeling} size="sm" />
            {thought.languageLabel && thought.language && !thought.language.toLowerCase().startsWith("en") && (
              <span>{thought.languageLabel}</span>
            )}
            <IntegrityBadge integrity={thought.integrity} />
          </div>
        </div>
      </div>

      {(thought.mediaType === "audio" || thought.mediaType === "video") && (
        <div className="relative z-0 mt-3 overflow-hidden rounded-xl border border-[var(--border-base)]">
          {thought.mediaType === "audio" && (
            <AudioPlayer
              src={mediaSrc}
              durationLabel={thought.mediaDuration}
              onProgress={setMediaTime}
              onElement={(el) => {
                mediaElRef.current = el;
              }}
            />
          )}
          {thought.mediaType === "video" && (
            <VideoPlayer
              src={mediaSrc}
              durationLabel={thought.mediaDuration}
              onProgress={setMediaTime}
              onElement={(el) => {
                mediaElRef.current = el;
              }}
            />
          )}
        </div>
      )}

      <div className="relative z-0 mt-3 space-y-2">
        {hasTranscript && thought.transcript && (
          <TranscriptPanel
            segments={thought.transcript}
            language={thought.language}
            languageLabel={thought.languageLabel}
            currentTime={mediaTime}
            onSeek={seekTo}
          />
        )}
        <p
          lang={thought.language}
          dir="auto"
          className="font-display text-[1.05rem] leading-[1.55] text-[var(--foreground)]"
        >
          {thought.content}
        </p>
        {shouldOfferTranslate(thought.language) && (
          <TranslateToEnglish text={thought.content} sourceLang={thought.language} />
        )}
        {thought.tags.length > 0 && (
          <p className="text-xs text-[var(--muted)]">
            {thought.tags.map((t) => t.replace(/^#/, "")).join(" · ")}
          </p>
        )}
      </div>

      <div className="relative z-0 mt-4 flex items-center gap-4 text-[var(--muted)]">
        <button
          onClick={like}
          aria-label={liked ? "Unlike" : "Like"}
          className={`flex items-center gap-1.5 text-xs font-medium transition ${
            liked ? "text-[var(--accent)]" : "hover:text-[var(--foreground)]"
          }`}
        >
          <Heart className="h-4 w-4" fill={liked ? "currentColor" : "none"} strokeWidth={2} />
          {likes}
        </button>
        <button
          type="button"
          onClick={() => setChatOpen((v) => !v)}
          className={`flex items-center gap-1.5 text-xs font-medium transition ${
            chatOpen ? "text-[var(--foreground)]" : "hover:text-[var(--foreground)]"
          }`}
        >
          <MessageCircle className="h-4 w-4" strokeWidth={2} />
          {commentCount != null && commentCount > 0 ? commentCount : "Reply"}
        </button>
        <button
          onClick={() => setShowReact((v) => !v)}
          className="text-xs font-medium hover:text-[var(--foreground)]"
        >
          React
        </button>
        <button
          onClick={() => setSaved((v) => !v)}
          aria-label="Save"
          className={`ml-auto transition ${saved ? "text-[var(--accent)]" : "hover:text-[var(--foreground)]"}`}
        >
          <Bookmark className="h-4 w-4" fill={saved ? "currentColor" : "none"} strokeWidth={2} />
        </button>
      </div>

      {showReact && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {REACTION_TYPES.map((r) => {
            const count = reactions.find((e) => e.type === r)?.count ?? 0;
            const isMine = mine === r;
            return (
              <button
                key={r}
                onClick={() => react(r)}
                className={`rounded-full px-2.5 py-1 text-sm transition ${
                  isMine
                    ? "bg-[var(--accent-soft)] text-[var(--accent-2)]"
                    : "bg-[var(--surface-2)] text-[var(--foreground)] hover:bg-[var(--accent-soft)]"
                }`}
              >
                {r}
                {count > 0 ? ` ${count}` : ""}
              </button>
            );
          })}
        </div>
      )}

      {thought.feeling && others && others > 1 && onOpenRoom && (
        <button
          onClick={() => onOpenRoom(thought.feeling!)}
          className="mt-3 text-left text-xs text-[var(--muted)] underline-offset-2 hover:text-[var(--accent)] hover:underline"
        >
          {others} others feel this too — open room
        </button>
      )}

      {(reporting || reported) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/25 sm:items-center">
          <div
            className="absolute inset-0"
            onClick={() => {
              setReporting(false);
              setReported(false);
            }}
          />
          <div className="relative w-full max-w-md rounded-t-2xl border border-[var(--border-base)] bg-[var(--surface)] p-5 sm:rounded-2xl">
            {reported ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <ShieldCheck className="h-8 w-8 text-[var(--accent)]" />
                <p className="text-sm font-semibold">Thanks — reported</p>
                <p className="text-xs text-[var(--muted)]">Keepers will review this take.</p>
                <button
                  onClick={() => {
                    setReported(false);
                    setReporting(false);
                  }}
                  className="mt-1 w-full rounded-full border border-[var(--border-base)] py-2.5 text-sm font-semibold"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <h3 className="font-display text-base font-semibold">Report this take</h3>
                <div className="mt-3 flex flex-col gap-2">
                  {REPORT_REASONS.map((reason) => (
                    <button
                      key={reason}
                      onClick={() => {
                        setReported(true);
                        onReport?.(thought.id, reason);
                      }}
                      className="rounded-xl border border-[var(--border-base)] px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-2)]"
                    >
                      {reason}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ChatPanel
        postId={thought.id}
        postAuthor={thought.author}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onCountChange={setCommentCount}
      />
    </article>
  );
}
