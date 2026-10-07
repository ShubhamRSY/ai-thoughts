"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  MessageCircle,
  Repeat2,
  Quote,
  Bookmark,
  BarChart2,
  MoreHorizontal,
  Flag,
  Trash2,
  Archive,
  HeartHandshake,
  BellOff,
} from "lucide-react";
import type { Thought, Reaction, FeelingId, LikedByPerson } from "@/lib/types";
import {
  LIKE_REACTION,
  BOOST_REACTION,
  BOOKMARK_REACTION,
  FEEL_REACTIONS,
  formatLikedBy,
} from "@/lib/likes";
import { FEELING_EDGE } from "@/lib/feelings";
import { markViewed } from "@/lib/db";
import AudioPlayer from "@/components/Player/AudioPlayer";
import VideoPlayer from "@/components/Player/VideoPlayer";
import TranscriptPanel from "@/components/Feed/TranscriptPanel";
import FeelingBadge from "@/components/FeelingBadge";
import VerifiedBadge from "@/components/VerifiedBadge";
import ChatPanel from "@/components/Chat/ChatPanel";
import TranslateToEnglish from "@/components/TranslateToEnglish";
import ShareCardButton from "@/components/ShareCardButton";
import { shouldOfferTranslate } from "@/lib/lang";
import type { ReportReason } from "@/lib/report-reasons";
import ReportDialog from "@/components/ReportDialog";
import { isNewAccount } from "@/lib/anti-abuse";

/** Post ids already counted as viewed during this page load. */
const viewedThisLoad = new Set<string>();

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Renders @handle and #tag tokens inside post text as tappable buttons.
 * Tapping never steals focus from the card; it opens the search tab (tag) or
 * the person's profile (mention) via the card's handlers.
 */
function linkifyText(
  text: string,
  onOpenTag?: (tag: string) => void,
  onOpenMention?: (handle: string) => void
) {
  const parts = text.split(/(#\w+|\uFF03\w+|@[\w.-]+)/g);
  return parts.map((part, i) => {
    if (!part || part === " ") return <span key={i}> </span>;
    if (part.length > 1 && part.startsWith("#")) {
      return (
        <button
          key={i}
          type="button"
          onClick={() => onOpenTag?.(part.slice(1))}
          className="font-semibold text-[var(--accent)] hover:underline"
        >
          {part}
        </button>
      );
    }
    if (part.length > 1 && part.startsWith("@")) {
      return (
        <button
          key={i}
          type="button"
          onClick={() => onOpenMention?.(part)}
          className="font-semibold text-[var(--accent)] hover:underline"
        >
          {part}
        </button>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export type { ReportReason };

interface FeedCardProps {
  thought: Thought;
  onReact?: (thoughtId: string, reaction: Reaction) => void | Promise<boolean>;
  onReport?: (thoughtId: string, reason: ReportReason) => void | Promise<boolean>;
  onDelete?: (thoughtId: string) => void;
  /** Hide a take from everyone but its author (reversible from the Account Center). */
  onArchive?: (thoughtId: string) => void;
  onOpenRoom?: (id: FeelingId) => void;
  onFeelWith?: (handle: string, next: boolean) => void;
  onQuoteRepost?: (postId: string, comment: string) => Promise<boolean>;
  /** Tap a #tag in a take's text → jump to search. */
  onOpenTag?: (tag: string) => void;
  /** Tap an @mention in a take's text → open that person. */
  onOpenMention?: (handle: string) => void;
  /** Mute/unmute the author from the card's menu. */
  onMute?: (handle: string, muted: boolean) => void | Promise<void>;
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

export default function FeedCard({
  thought,
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
  const [mineFeel, setMineFeel] = useState<Set<string>>(() => new Set(thought.myReactions ?? []));
  const [feelCounts, setFeelCounts] = useState<Record<string, number>>(() =>
    Object.fromEntries(thought.reactions.map((r) => [r.type, r.count]))
  );
  const [boosted, setBoosted] = useState(Boolean(thought.boostedByMe));
  const [boosts, setBoosts] = useState(thought.boostCount ?? 0);
  const [quoting, setQuoting] = useState(false);
  const [quoteText, setQuoteText] = useState("");
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [bookmarked, setBookmarked] = useState(Boolean(thought.bookmarkedByMe));
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
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

  // Count a view once the card is actually on screen, once per page load —
  // not on mount, which fired a request for every card in the feed.
  const cardRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = cardRef.current;
    const id = thought.id;
    if (!el || viewedThisLoad.has(id)) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || viewedThisLoad.has(id)) return;
        viewedThisLoad.add(id);
        io.disconnect();
        void markViewed(id);
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [thought.id]);

  useEffect(() => {
    if (forceChatOpen) setChatOpen(true);
  }, [forceChatOpen]);

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

  /** 😟 / 🤩 toggles. Same 🫂 goes through like() so "Felt the same: …" stays in sync. */
  const toggleFeel = async (reaction: Reaction) => {
    if (!currentHandle) return;
    setActionError(null);
    const was = mineFeel.has(reaction);
    const bump = (on: boolean) => {
      setMineFeel((prev) => {
        const next = new Set(prev);
        if (on) next.add(reaction);
        else next.delete(reaction);
        return next;
      });
      setFeelCounts((prev) => ({
        ...prev,
        [reaction]: Math.max(0, (prev[reaction] ?? 0) + (on ? 1 : -1)),
      }));
    };
    bump(!was);
    const ok = onReact ? await Promise.resolve(onReact(thought.id, reaction)) : true;
    if (ok === false) {
      bump(was);
      setActionError("Couldn’t save that — try again.");
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

  const submitQuote = async () => {
    if (!currentHandle || !onQuoteRepost || !quoteText.trim()) return;
    setQuoteBusy(true);
    setQuoteError(null);
    const ok = await onQuoteRepost(thought.id, quoteText.trim());
    setQuoteBusy(false);
    if (ok) {
      setBoosted(true);
      setBoosts((n) => (boosted ? n : n + 1));
      setQuoting(false);
      setQuoteText("");
    } else {
      setQuoteError("Couldn’t post that — try again.");
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
      ref={cardRef}
      id={`card-${thought.id}`}
      data-feed-card
      tabIndex={-1}
      style={{ borderLeftColor: (thought.feeling && FEELING_EDGE[thought.feeling]) || "transparent" }}
      className="relative isolate -mx-2 rounded-r-lg border-b border-l-[3px] border-[var(--border-base)] bg-[var(--surface)] py-4 pl-3 pr-2 outline-none transition-colors hover:bg-[var(--surface-2)]/40 focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
    >
      <div className="flex items-start gap-3">
        <div className="relative mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-2)] text-[11px] font-semibold text-[var(--foreground)]">
          {initials(thought.author)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {thought.author && (
              <span className="truncate text-sm font-semibold text-[var(--foreground)]">
                {thought.author}
              </span>
            )}
            {thought.authorVerified && (
              <span className="shrink-0 text-sky-500">
                <VerifiedBadge className="h-4 w-4" />
              </span>
            )}
            {thought.handle && (
              <span className="truncate text-[13px] font-normal text-[var(--foreground)]/70">
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
                    {isAuthor && onArchive && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          onArchive(thought.id);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Archive
                      </button>
                    )}
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
                    {!isAuthor && onMute && (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuOpen(false);
                          void onMute(thought.handle, true); // muted authors drop out of the feed on reload
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-2)]"
                      >
                        <BellOff className="h-3.5 w-3.5" />
                        Mute
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
                customLabel={thought.feeling === "custom" ? thought.customFeeling : undefined}
                onClick={
                  onOpenRoom && thought.feeling && thought.feeling !== "custom"
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
          <img
            src={thought.mediaUrl}
            alt={thought.content ? `Photo: ${thought.content}` : `Photo attached by ${thought.author}`}
            className="max-h-[520px] w-full object-contain"
          />
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
          className="whitespace-pre-wrap text-[17px] leading-relaxed text-[var(--user-ink)]"
        >
          {linkifyText(thought.content, onOpenTag, onOpenMention)}
        </p>
        {shouldOfferTranslate(thought.language) && (
          <TranslateToEnglish text={thought.content} sourceLang={thought.language} />
        )}
        {thought.tags.length > 0 && (
          <p className="flex flex-wrap gap-x-2 gap-y-0.5 text-[14px] text-[var(--accent)]">
            {thought.tags.map((t) => {
              const tag = t.replace(/^#/, "");
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onOpenTag?.(tag)}
                  className="hover:underline"
                >
                  #{tag}
                </button>
              );
            })}
          </p>
        )}
        {thought.quotedPostId && (
          <div className="mt-1 rounded-xl border border-[var(--border-base)] bg-[var(--surface)]/60 p-3">
            {thought.quotedPost ? (
              <>
                <p className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--foreground)]">
                  {thought.quotedPost.author && (
                    <span className="truncate">
                      {thought.quotedPost.author || thought.quotedPost.handle.replace(/^@/, "")}
                    </span>
                  )}
                  {thought.quotedPost.authorVerified && (
                    <span className="shrink-0 text-sky-500">
                      <VerifiedBadge className="h-3.5 w-3.5" />
                    </span>
                  )}
                  <span className="shrink-0 font-normal text-[var(--foreground)]/60">
                    {thought.quotedPost.handle.startsWith("@")
                      ? thought.quotedPost.handle
                      : `@${thought.quotedPost.handle}`}
                  </span>
                </p>
                <p
                  dir="auto"
                  className="mt-1 line-clamp-4 whitespace-pre-wrap text-[14px] leading-relaxed text-[var(--user-ink)]/85"
                >
                  {linkifyText(thought.quotedPost.content, onOpenTag, onOpenMention)}
                </p>
              </>
            ) : (
              <p className="text-[13px] text-[var(--muted)]">This take was removed.</p>
            )}
          </div>
        )}
      </div>

      <div
        role="group"
        aria-label="How does this make you feel?"
        className="relative z-0 mt-3 flex flex-wrap items-center gap-1.5 text-[var(--foreground)]/75"
      >
        {FEEL_REACTIONS.map(({ reaction, emoji, label }) => {
          const isSame = reaction === LIKE_REACTION;
          const on = isSame ? liked : mineFeel.has(reaction);
          const count = isSame ? likes : feelCounts[reaction] ?? 0;
          return (
            <button
              key={reaction}
              type="button"
              onClick={() => void (isSame ? like() : toggleFeel(reaction))}
              disabled={!currentHandle}
              aria-pressed={on}
              aria-label={`${label}${count ? `, ${count}` : ""}`}
              title={!currentHandle ? "Sign in to react" : label}
              className={`flex h-8 items-center gap-1 rounded-full border px-2.5 text-[13px] font-medium transition active:scale-95 disabled:opacity-50 ${
                on
                  ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
                  : "border-[var(--border-base)] hover:border-[var(--accent)] hover:text-[var(--foreground)]"
              }`}
            >
              <span aria-hidden>{emoji}</span>
              {label}
              {count > 0 && <span className="tabular-nums opacity-80">{count}</span>}
            </button>
          );
        })}
      </div>

      <div className="relative z-0 mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 text-[var(--foreground)]/65">
        <button
          type="button"
          onClick={() => void boost()}
          disabled={!currentHandle}
          aria-label={boosted ? "Undo repost" : "Repost"}
          title={!currentHandle ? "Sign in to repost" : undefined}
          className={`flex items-center gap-1.5 text-sm font-medium transition disabled:opacity-50 ${
            boosted ? "text-[var(--accent)]" : "hover:text-[var(--foreground)]"
          }`}
        >
          <Repeat2 className="h-5 w-5" strokeWidth={2} />
          {boosts > 0 ? boosts : null}
        </button>
        {onQuoteRepost && (
          <button
            type="button"
            onClick={() => setQuoting(true)}
            disabled={!currentHandle}
            aria-label="Quote repost"
            title={!currentHandle ? "Sign in to repost" : "Repost with a comment"}
            className="flex items-center gap-1.5 text-sm font-medium transition hover:text-[var(--foreground)] disabled:opacity-50"
          >
            <Quote className="h-5 w-5" strokeWidth={2} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setChatOpen((v) => !v)}
          className={`flex items-center gap-1.5 text-sm font-medium transition ${
            chatOpen ? "text-[var(--foreground)]" : "hover:text-[var(--foreground)]"
          }`}
        >
          <MessageCircle className="h-5 w-5" strokeWidth={2} />
          {commentCount != null && commentCount > 0 ? commentCount : "Reply"}
        </button>
        {typeof thought.viewCount === "number" && thought.viewCount > 0 && (
          <span className="flex items-center gap-1.5 text-sm font-medium text-[var(--muted)]">
            <BarChart2 className="h-5 w-5" strokeWidth={2} />
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
          <Bookmark className="h-5 w-5" fill={bookmarked ? "currentColor" : "none"} strokeWidth={2} />
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
        quoting &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/40 sm:items-center">
            <button
              type="button"
              className="absolute inset-0 cursor-default"
              aria-label="Close quote repost"
              onClick={() => {
                setQuoting(false);
                setQuoteError(null);
              }}
            />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="quote-title"
              className="relative z-10 flex max-h-[min(85dvh,32rem)] w-full max-w-md flex-col rounded-t-2xl border border-[var(--border-base)] bg-[var(--surface)] shadow-xl sm:rounded-2xl"
            >
              <div className="flex items-center justify-between border-b border-[var(--border-base)] px-5 py-3">
                <h3 id="quote-title" className="font-display text-base font-semibold">
                  Repost with comment
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setQuoting(false);
                    setQuoteError(null);
                  }}
                  className="text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Cancel
                </button>
              </div>
              <div className="overflow-y-auto overscroll-contain px-5 py-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <textarea
                  value={quoteText}
                  aria-label="Add a comment"
                  onChange={(e) => setQuoteText(e.target.value.slice(0, 500))}
                  rows={3}
                  placeholder="Add a comment…"
                  className="w-full resize-none rounded-xl border border-[var(--border-base)] bg-transparent px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
                />
                <div className="mt-3 rounded-xl border border-[var(--border-base)] bg-[var(--surface)]/60 p-3">
                  <p className="text-[13px] font-semibold text-[var(--foreground)]">
                    {thought.handle.startsWith("@") ? thought.handle : `@${thought.handle}`}
                  </p>
                  <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[14px] text-[var(--user-ink)]/85">
                    {thought.content}
                  </p>
                </div>
                {quoteError && <p className="mt-3 text-sm text-rose-700">{quoteError}</p>}
                <button
                  type="button"
                  disabled={quoteBusy || !quoteText.trim()}
                  onClick={() => void submitQuote()}
                  className="mt-4 w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--surface)] disabled:opacity-50"
                >
                  {quoteBusy ? "Posting…" : "Repost"}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {mounted && reporting && (
        <ReportDialog
          subject="take"
          signedIn={Boolean(currentHandle)}
          onSubmit={async (reason) =>
            (onReport ? await Promise.resolve(onReport(thought.id, reason)) : true) !== false
          }
          onClose={() => setReporting(false)}
        />
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
