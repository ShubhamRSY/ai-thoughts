"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MessageCircle,
  Heart,
  MoreHorizontal,
  Flag,
  ShieldCheck,
  Trash2,
  HeartHandshake,
} from "lucide-react";
import type { Thought, Reaction, FeelingId, LikedByPerson } from "@/lib/types";
import { REACTION_TYPES } from "@/lib/mock-data";
import { LIKE_REACTION, formatLikedBy } from "@/lib/likes";
import AudioPlayer from "@/components/Player/AudioPlayer";
import VideoPlayer from "@/components/Player/VideoPlayer";
import IntegrityBadge from "@/components/IntegrityBadge";
import TranscriptPanel from "@/components/Feed/TranscriptPanel";
import FeelingBadge from "@/components/FeelingBadge";
import ChatPanel from "@/components/Chat/ChatPanel";
import TranslateToEnglish from "@/components/TranslateToEnglish";
import { shouldOfferTranslate } from "@/lib/lang";
import { feelingOf, feelingWash } from "@/lib/feelings";
import { isNewAccount } from "@/lib/anti-abuse";
import { todayKey } from "@/lib/daily-prompt";

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
  | "Spam or coordinated accounts"
  | "Misleading or fake story"
  | "Sounds AI-generated"
  | "Impersonation"
  | "Harms someone";

interface FeedCardProps {
  thought: Thought;
  onReact?: (thoughtId: string, reaction: Reaction) => void | Promise<boolean>;
  onReport?: (thoughtId: string, reason: ReportReason) => void | Promise<boolean>;
  onDelete?: (thoughtId: string) => void;
  onOpenRoom?: (id: FeelingId) => void;
  onFeelWith?: (handle: string, next: boolean) => void;
  feelingWith?: boolean;
  /** Signed-in handle — only this author sees Delete on their take. */
  currentHandle?: string | null;
  /** Display name for optimistic “Liked by You”. */
  currentAuthor?: string | null;
  others?: number;
  /** Open comments when deep-linked from activity. */
  forceChatOpen?: boolean;
}

function sameHandle(a?: string | null, b?: string | null) {
  if (!a || !b) return false;
  return a.trim().toLowerCase().replace(/^@/, "") === b.trim().toLowerCase().replace(/^@/, "");
}

const REPORT_REASONS: ReportReason[] = [
  "Hate or harassment",
  "Unsafe or explicit",
  "Spam or coordinated accounts",
  "Misleading or fake story",
  "Sounds AI-generated",
  "Impersonation",
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
  currentAuthor,
  others,
  forceChatOpen,
}: FeedCardProps) {
  const [reactions, setReactions] = useState(thought.reactions);
  const [mine, setMine] = useState<Reaction | null>(null);
  const [liked, setLiked] = useState(Boolean(thought.likedByMe));
  const [likes, setLikes] = useState(
    typeof thought.likeCount === "number"
      ? thought.likeCount
      : thought.reactions.find((e) => e.type === LIKE_REACTION)?.count ?? 0
  );
  const [likedBy, setLikedBy] = useState<LikedByPerson[]>(thought.likedBy ?? []);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [reportBusy, setReportBusy] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [chatOpen, setChatOpen] = useState(Boolean(forceChatOpen));
  const [actionError, setActionError] = useState<string | null>(null);
  const [commentCount, setCommentCount] = useState<number | null>(
    typeof thought.replyCount === "number" ? thought.replyCount : null
  );
  const [showReact, setShowReact] = useState(false);
  const [feeling, setFeeling] = useState(Boolean(feelingWith));

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (forceChatOpen) setChatOpen(true);
  }, [forceChatOpen]);

  const submitReport = async (reason: ReportReason) => {
    if (reportBusy) return;
    setReportBusy(true);
    setReportError(null);
    try {
      if (!currentHandle) {
        setReportError("Sign in to report a take.");
        return;
      }
      const ok = onReport ? await Promise.resolve(onReport(thought.id, reason)) : true;
      if (ok === false) {
        setReportError("Couldn’t send that report — try again.");
        return;
      }
      setReported(true);
    } finally {
      setReportBusy(false);
    }
  };

  const closeReport = () => {
    setReporting(false);
    setReported(false);
    setReportError(null);
    setReportBusy(false);
  };

  const isAuthor = sameHandle(currentHandle, thought.handle);
  const authorIsNew = isNewAccount(thought.authorJoinedAt ?? null, 7 * 24 * 3600_000);
  // Prefer prop when parent knows follow state; fall back to optimistic local toggle.
  const feelingActive = feelingWith !== undefined ? Boolean(feelingWith) : feeling;

  const mediaElRef = useRef<HTMLMediaElement | null>(null);
  const [mediaTime, setMediaTime] = useState(0);
  const hasTranscript = Boolean(
    (thought.mediaType === "audio" || thought.mediaType === "video") && thought.transcript?.length
  );
  const mediaSrc = thought.streamReady && thought.streamUrl ? thought.streamUrl : thought.mediaUrl;

  const react = async (r: Reaction) => {
    if (!currentHandle) return;
    setActionError(null);
    const prevReactions = reactions;
    const prevMine = mine;
    if (mine === r) {
      setReactions((prev) =>
        prev.map((e) => (e.type === r ? { ...e, count: Math.max(0, e.count - 1) } : e))
      );
      setMine(null);
    } else {
      setReactions((prev) =>
        prev.map((e) => {
          if (e.type === r) return { ...e, count: e.count + 1 };
          if (mine && e.type === mine) return { ...e, count: Math.max(0, e.count - 1) };
          return e;
        })
      );
      setMine(r);
    }
    const ok = onReact ? await Promise.resolve(onReact(thought.id, r)) : true;
    if (ok === false) {
      setReactions(prevReactions);
      setMine(prevMine);
      setActionError("Couldn’t save that reaction — try again.");
    }
  };

  const like = async () => {
    if (!currentHandle) return;
    setActionError(null);
    const was = liked;
    const prevLikes = likes;
    const prevLikedBy = likedBy;
    const next = !was;
    setLiked(next);
    setLikes(Math.max(0, likes + (next ? 1 : -1)));
    setLikedBy((prev) => {
      const key = currentHandle.trim().toLowerCase().replace(/^@/, "");
      if (next) {
        if (prev.some((p) => sameHandle(p.handle, currentHandle))) return prev;
        return [
          {
            handle: currentHandle.startsWith("@") ? currentHandle : `@${key}`,
            author: currentAuthor?.trim() || "You",
          },
          ...prev,
        ];
      }
      return prev.filter((p) => !sameHandle(p.handle, currentHandle));
    });
    const ok = onReact ? await Promise.resolve(onReact(thought.id, LIKE_REACTION)) : true;
    if (ok === false) {
      setLiked(was);
      setLikes(prevLikes);
      setLikedBy(prevLikedBy);
      setActionError("Couldn’t save that like — try again.");
    }
  };

  const seekTo = (t: number) => {
    const el = mediaElRef.current;
    if (!el) return;
    el.currentTime = t;
    el.play().catch(() => {});
  };

  return (
    <article
      className={`relative isolate border-b border-[var(--border-base)] bg-[var(--surface)] py-5 ${feelingWash(thought.feeling)}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[11px] font-semibold text-[var(--foreground)]">
          {initials(thought.author)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold text-[var(--foreground)]">
              {thought.author}
            </span>
            {authorIsNew && (
              <span
                className="shrink-0 rounded-full border border-[var(--border-base)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]"
                title="Account created in the last 7 days"
              >
                New
              </span>
            )}
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
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-[var(--muted)]">
            {thought.feeling && (
              <FeelingBadge
                feeling={thought.feeling}
                size="sm"
                onClick={
                  onOpenRoom && thought.feeling
                    ? () => onOpenRoom(thought.feeling!)
                    : undefined
                }
              />
            )}
            {thought.promptDay === todayKey() && (
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--accent-2)]">
                Today&apos;s prompt
              </span>
            )}
            {thought.promptDay && thought.promptDay !== todayKey() && (
              <span className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                Prompt · {thought.promptDay.slice(5)}
              </span>
            )}
            {thought.integrity.statusLabel === "Sample voice" && (
              <span className="rounded-full border border-[var(--border-base)] px-2 py-0.5 text-[10px] font-semibold text-[var(--muted)]">
                Sample
              </span>
            )}
            {thought.languageLabel && thought.language && !thought.language.toLowerCase().startsWith("en") && (
              <span>{thought.languageLabel}</span>
            )}
            <IntegrityBadge integrity={thought.integrity} />
          </div>
          {thought.feeling && feelingOf(thought.feeling) && (
            <p className="mt-2 text-[13px] italic leading-snug text-[var(--foreground)]/80">
              {feelingOf(thought.feeling)!.label}
            </p>
          )}
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
        <p className="text-[10px] text-[var(--muted)]">
          Personal feeling — not a verified claim. Report if it looks fake, copied, or AI spam.
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
          type="button"
          onClick={() => void like()}
          disabled={!currentHandle}
          aria-label={liked ? "Unlike" : "Like"}
          title={!currentHandle ? "Sign in to like" : undefined}
          className={`flex items-center gap-1.5 text-xs font-medium transition disabled:opacity-50 ${
            liked ? "text-[var(--accent)]" : "hover:text-[var(--foreground)]"
          }`}
        >
          <Heart className="h-4 w-4" fill={liked ? "currentColor" : "none"} strokeWidth={2} />
          {likes > 0 ? likes : null}
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
          type="button"
          onClick={() => setShowReact((v) => !v)}
          disabled={!currentHandle}
          title={!currentHandle ? "Sign in to react" : undefined}
          className="text-xs font-medium hover:text-[var(--foreground)] disabled:opacity-50"
        >
          React
        </button>
      </div>

      {actionError && (
        <p className="relative z-0 mt-2 text-[11px] text-rose-700">{actionError}</p>
      )}

      {likes > 0 && (
        <p className="relative z-0 mt-2 text-xs text-[var(--muted)]">
          {formatLikedBy(likedBy, likes, currentHandle)}
        </p>
      )}

      {showReact && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {REACTION_TYPES.map((r) => {
            const count = reactions.find((e) => e.type === r)?.count ?? 0;
            const isMine = mine === r;
            return (
              <button
                key={r}
                type="button"
                disabled={!currentHandle}
                onClick={() => void react(r)}
                className={`rounded-full px-2.5 py-1 text-sm transition disabled:opacity-50 ${
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
          className="mt-3 text-left text-xs font-medium text-[var(--accent)] underline-offset-2 hover:underline"
        >
          {others} others feel this too — sit with them
        </button>
      )}

      {mounted &&
        (reporting || reported) &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center">
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close report"
              onClick={closeReport}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="report-title"
              className="relative z-10 flex max-h-[min(85dvh,32rem)] w-full max-w-md flex-col rounded-t-2xl border border-[var(--border-base)] bg-[var(--surface)] shadow-xl sm:rounded-2xl"
            >
              {reported ? (
                <div className="flex flex-col items-center gap-3 px-5 py-8 text-center">
                  <ShieldCheck className="h-8 w-8 text-[var(--accent)]" />
                  <p className="text-sm font-semibold">Thanks — reported</p>
                  <p className="text-xs text-[var(--muted)]">Keepers will review this take.</p>
                  <button
                    type="button"
                    onClick={closeReport}
                    className="mt-1 w-full rounded-full border border-[var(--border-base)] py-2.5 text-sm font-semibold"
                  >
                    Done
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-[var(--border-base)] px-5 py-3">
                    <h3 id="report-title" className="font-display text-base font-semibold">
                      Report this take
                    </h3>
                    <button
                      type="button"
                      onClick={closeReport}
                      className="text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
                    >
                      Cancel
                    </button>
                  </div>
                  <div className="overflow-y-auto overscroll-contain px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                    {!currentHandle && (
                      <p className="mb-3 text-sm text-[var(--muted)]">
                        Sign in to send a report to keepers.
                      </p>
                    )}
                    {reportError && (
                      <p className="mb-3 text-sm text-rose-700">{reportError}</p>
                    )}
                    <div className="flex flex-col gap-2">
                      {REPORT_REASONS.map((reason) => (
                        <button
                          key={reason}
                          type="button"
                          disabled={reportBusy || !currentHandle}
                          onClick={() => void submitReport(reason)}
                          className="rounded-xl border border-[var(--border-base)] px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-2)] disabled:opacity-50"
                        >
                          {reason}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body
        )}

      <ChatPanel
        postId={thought.id}
        postAuthor={thought.author}
        postHandle={thought.handle}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        onCountChange={setCommentCount}
      />
    </article>
  );
}
