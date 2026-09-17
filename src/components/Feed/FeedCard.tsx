"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MessageCircle,
  Heart,
  Repeat2,
  Bookmark,
  BarChart2,
  MoreHorizontal,
  Flag,
  ShieldCheck,
  Trash2,
  HeartHandshake,
} from "lucide-react";
import type { Thought, Reaction, FeelingId, LikedByPerson } from "@/lib/types";
import { LIKE_REACTION, BOOST_REACTION, BOOKMARK_REACTION, formatLikedBy } from "@/lib/likes";
import { markViewed } from "@/lib/db";
import AudioPlayer from "@/components/Player/AudioPlayer";
import VideoPlayer from "@/components/Player/VideoPlayer";
import TranscriptPanel from "@/components/Feed/TranscriptPanel";
import FeelingBadge from "@/components/FeelingBadge";
import ChatPanel from "@/components/Chat/ChatPanel";
import TranslateToEnglish from "@/components/TranslateToEnglish";
import ShareCardButton from "@/components/ShareCardButton";
import { shouldOfferTranslate } from "@/lib/lang";
import { isNewAccount } from "@/lib/anti-abuse";

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
  /** Display name for optimistic “Liked by you”. */
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
  forceChatOpen,
}: FeedCardProps) {
  const [liked, setLiked] = useState(Boolean(thought.likedByMe));
  const [likes, setLikes] = useState(
    typeof thought.likeCount === "number"
      ? thought.likeCount
      : thought.reactions.find((e) => e.type === LIKE_REACTION)?.count ?? 0
  );
  const [likedBy, setLikedBy] = useState<LikedByPerson[]>(thought.likedBy ?? []);
  const [boosted, setBoosted] = useState(Boolean(thought.boostedByMe));
  const [boosts, setBoosts] = useState(thought.boostCount ?? 0);
  const [bookmarked, setBookmarked] = useState(Boolean(thought.bookmarkedByMe));
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
  const [feeling, setFeeling] = useState(Boolean(feelingWith));

  useEffect(() => {
    setMounted(true);
  }, []);

  // ponytail: "mounted" ≈ "seen" — see markViewed's doc comment for the upgrade path.
  useEffect(() => {
    void markViewed(thought.id);
  }, [thought.id]);

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

  const boost = async () => {
    if (!currentHandle) return;
    setActionError(null);
    const was = boosted;
    const prevBoosts = boosts;
    const next = !was;
    setBoosted(next);
    setBoosts(Math.max(0, boosts + (next ? 1 : -1)));
    const ok = onReact ? await Promise.resolve(onReact(thought.id, BOOST_REACTION)) : true;
    if (ok === false) {
      setBoosted(was);
      setBoosts(prevBoosts);
      setActionError("Couldn’t save that repost — try again.");
    }
  };

  const bookmark = async () => {
    if (!currentHandle) return;
    setActionError(null);
    const was = bookmarked;
    setBookmarked(!was);
    const ok = onReact ? await Promise.resolve(onReact(thought.id, BOOKMARK_REACTION)) : true;
    if (ok === false) {
      setBookmarked(was);
      setActionError("Couldn’t save that bookmark — try again.");
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
      className="relative isolate border-b border-[var(--border-base)] bg-[var(--surface)] py-4"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[11px] font-semibold text-[var(--foreground)]">
          {initials(thought.author)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-[var(--foreground)]">
              {thought.author}
            </span>
            {thought.handle && (
              <span className="truncate text-[13px] text-[var(--foreground)]/70">
                {thought.handle.startsWith("@") ? thought.handle : `@${thought.handle}`}
              </span>
            )}
            {authorIsNew && (
              <span
                className="shrink-0 text-[13px] text-[var(--foreground)]/70"
                title="Joined in the last week"
              >
                · new
              </span>
            )}
            <span className="shrink-0 text-[13px] text-[var(--foreground)]/70">
              · {thought.timeLabel}
            </span>
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
                            !window.confirm("Delete this post?")
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
                        {deleting ? "Deleting…" : "Delete"}
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
                        {feelingActive ? "Unfollow" : "Follow"}
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
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[var(--foreground)]/70">
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
            {thought.integrity.statusLabel === "Sample voice" && (
              <span className="text-[13px] text-[var(--foreground)]/70">Sample</span>
            )}
            {thought.languageLabel &&
              thought.language &&
              !thought.language.toLowerCase().startsWith("en") && (
                <span className="text-[13px] text-[var(--foreground)]/70">
                  {thought.languageLabel}
                </span>
              )}
          </div>
        </div>
      </div>

      {thought.mediaType === "text" && thought.mediaUrl && (
        <div className="relative z-0 mt-3 overflow-hidden rounded-xl border border-[var(--border-base)] bg-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={thought.mediaUrl} alt="" className="max-h-[520px] w-full object-contain" />
        </div>
      )}

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
          className="whitespace-pre-wrap text-[16px] leading-relaxed text-[var(--foreground)]"
        >
          {thought.content}
        </p>
        {shouldOfferTranslate(thought.language) && (
          <TranslateToEnglish text={thought.content} sourceLang={thought.language} />
        )}
        {thought.tags.length > 0 && (
          <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-[14px] text-[var(--accent)]">
            {thought.tags.map((t) => {
              const tag = t.replace(/^#/, "");
              return (
                <span key={tag}>#{tag}</span>
              );
            })}
          </p>
        )}
      </div>

      <div className="relative z-0 mt-4 flex items-center gap-4 text-[var(--foreground)]/65">
        <button
          type="button"
          onClick={() => void like()}
          disabled={!currentHandle}
          aria-label={liked ? "Unlike" : "Like"}
          title={!currentHandle ? "Sign in to like" : undefined}
          className={`flex items-center gap-1.5 text-[13px] font-medium transition disabled:opacity-50 ${
            liked ? "text-[var(--accent)]" : "hover:text-[var(--foreground)]"
          }`}
        >
          <Heart className="h-[18px] w-[18px]" fill={liked ? "currentColor" : "none"} strokeWidth={2} />
          {likes > 0 ? likes : null}
        </button>
        <button
          type="button"
          onClick={() => void boost()}
          disabled={!currentHandle}
          aria-label={boosted ? "Undo repost" : "Repost"}
          title={!currentHandle ? "Sign in to repost" : undefined}
          className={`flex items-center gap-1.5 text-[13px] font-medium transition disabled:opacity-50 ${
            boosted ? "text-[var(--accent)]" : "hover:text-[var(--foreground)]"
          }`}
        >
          <Repeat2 className="h-[18px] w-[18px]" strokeWidth={2} />
          {boosts > 0 ? boosts : null}
        </button>
        <button
          type="button"
          onClick={() => setChatOpen((v) => !v)}
          className={`flex items-center gap-1.5 text-[13px] font-medium transition ${
            chatOpen ? "text-[var(--foreground)]" : "hover:text-[var(--foreground)]"
          }`}
        >
          <MessageCircle className="h-[18px] w-[18px]" strokeWidth={2} />
          {commentCount != null && commentCount > 0 ? commentCount : "Reply"}
        </button>
        {typeof thought.viewCount === "number" && thought.viewCount > 0 && (
          <span className="flex items-center gap-1.5 text-[13px] font-medium text-[var(--foreground)]/50">
            <BarChart2 className="h-[18px] w-[18px]" strokeWidth={2} />
            {thought.viewCount}
          </span>
        )}
        <button
          type="button"
          onClick={() => void bookmark()}
          disabled={!currentHandle}
          aria-label={bookmarked ? "Remove bookmark" : "Bookmark"}
          title={!currentHandle ? "Sign in to bookmark" : undefined}
          className={`flex items-center transition disabled:opacity-50 ${
            bookmarked ? "text-[var(--accent)]" : "hover:text-[var(--foreground)]"
          }`}
        >
          <Bookmark className="h-[18px] w-[18px]" fill={bookmarked ? "currentColor" : "none"} strokeWidth={2} />
        </button>
        <ShareCardButton thought={thought} />
      </div>

      {actionError && (
        <p className="relative z-0 mt-2 text-[13px] text-rose-700">{actionError}</p>
      )}

      {likes > 0 && (
        <p className="relative z-0 mt-1.5 text-[14px] text-[var(--foreground)]/70">
          {formatLikedBy(likedBy, likes, currentHandle)}
        </p>
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
                  <p className="text-xs text-[var(--muted)]">We&apos;ll take a look.</p>
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
                      Report
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
                        Sign in to send a report.
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
