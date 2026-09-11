"use client";

import { useRef, useState } from "react";
import {
  MessageCircle,
  Flame,
  Globe,
  Bookmark,
  MoreHorizontal,
  Flag,
  ShieldCheck,
} from "lucide-react";
import type {
  Thought,
  Reaction,
  FeelingId,
} from "@/lib/types";
import { REACTION_TYPES } from "@/lib/mock-data";
import AudioPlayer from "@/components/Player/AudioPlayer";
import VideoPlayer from "@/components/Player/VideoPlayer";
import IntegrityBadge from "@/components/IntegrityBadge";
import TranscriptPanel from "@/components/Feed/TranscriptPanel";
import FeelingBadge from "@/components/FeelingBadge";
import ChatPanel from "@/components/Chat/ChatPanel";

// Initials avatar with soft light-friendly tones
const GRADIENTS = [
  "from-teal-500 to-cyan-600",
  "from-sky-500 to-blue-600",
  "from-amber-500 to-orange-500",
  "from-rose-400 to-rose-600",
  "from-slate-500 to-slate-700",
];

function avatarGradient(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 997;
  return GRADIENTS[h % GRADIENTS.length];
}

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
  onOpenRoom?: (id: FeelingId) => void;
  /** How many other takes share this card's feeling (safety in numbers). */
  others?: number;
}

const REPORT_REASONS: ReportReason[] = [
  "Hate or harassment",
  "Unsafe or explicit",
  "Spam or fake",
  "Harms someone",
];

function makeFloater(r: Reaction) {
  return {
    id: Date.now() + Math.random(),
    r,
    x: -24 + Math.random() * 48,
    rot: -14 + Math.random() * 28,
  };
}

export default function FeedCard({ thought, onReact, onReport, onOpenRoom, others }: FeedCardProps) {
  const [reactions, setReactions] = useState(thought.reactions);
  const [mine, setMine] = useState<Reaction | null>(null);
  const [burst, setBurst] = useState<Reaction | null>(null);
  const [floaters, setFloaters] = useState<{ id: number; r: Reaction; x: number; rot: number }[]>(
    []
  );
  const [liked, setLiked] = useState(false);
  const [likes, setLikes] = useState(
    thought.reactions.reduce((s, e) => s + e.count, 0) + 12
  );
  const [saved, setSaved] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

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
    setBurst(r);
    const floater = makeFloater(r);
    setFloaters((prev) => [...prev, floater]);
    setTimeout(() => setFloaters((prev) => prev.filter((f) => f.id !== floater.id)), 750);
    setTimeout(() => setBurst(null), 500);
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
    <article className="animate-rise-in relative overflow-hidden rounded-2xl border border-[var(--border-base)] bg-white shadow-sm shadow-slate-900/5">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 pb-1">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(
            thought.handle
          )} text-xs font-bold text-white shadow-sm`}
        >
          {initials(thought.author)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-sm font-semibold text-[var(--foreground)]">
              {thought.author}
            </span>
            <span className="shrink-0 whitespace-nowrap text-xs text-[var(--muted)]">
              · {thought.timeLabel}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <FeelingBadge feeling={thought.feeling} size="sm" />
            {thought.languageLabel && (
              <span className="flex items-center gap-1 rounded-md bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted)]">
                <Globe className="h-2.5 w-2.5" />
                {thought.languageLabel}
              </span>
            )}
            <IntegrityBadge integrity={thought.integrity} />
          </div>
        </div>
        {/* Overflow menu */}
        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More options"
            className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-[var(--border-base)] bg-white shadow-lg shadow-slate-900/10">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setReporting(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--foreground)] transition hover:bg-[var(--surface-2)]"
                >
                  <Flag className="h-4 w-4 text-rose-500" />
                  Report this take
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Media — full-bleed, IG-style */}
      <div className="px-0">
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

      {/* Action bar */}
      <div className="flex items-center gap-3 px-3 pt-3 text-[var(--muted)]">
        <button
          onClick={like}
          aria-label={liked ? "Unlike" : "Like"}
          className={`transition active:scale-90 ${liked ? "text-rose-500" : "hover:text-[var(--foreground)]"}`}
        >
          <Flame className="h-[22px] w-[22px]" fill={liked ? "currentColor" : "none"} strokeWidth={2.2} />
        </button>
        <button
          onClick={() => setChatOpen(true)}
          className="transition hover:text-[var(--foreground)]"
          aria-label="Comment"
        >
          <MessageCircle className="h-[22px] w-[22px]" strokeWidth={2.2} />
        </button>
        <button
          onClick={() => setSaved((v) => !v)}
          aria-label="Save"
          className={`ml-auto transition active:scale-90 ${
            saved ? "text-[var(--accent)]" : "hover:text-[var(--foreground)]"
          }`}
        >
          <Bookmark className="h-[22px] w-[22px]" fill={saved ? "currentColor" : "none"} strokeWidth={2.2} />
        </button>
      </div>

      {/* Liked / reacted strip */}
      <div className="px-3 pt-2 text-[11px] font-medium text-[var(--muted)]">
        <span className="tabular-nums">
          {likes + reactions.reduce((s, e) => s + e.count, 0)} feel{likes ? "" : "s"}
        </span>
        <span className="text-[var(--muted)]/70"> · {thought.handle}</span>
      </div>

      {/* Feeling + reaction burst */}
      {burst && (
        <div className="px-3 pt-2">
          <span className="animate-spring inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-sm text-[var(--accent-2)]">
            {burst} You feel this too
          </span>
        </div>
      )}

      {/* Floating reaction emojis */}
      {floaters.map((f) => (
        <span
          key={f.id}
          aria-hidden
          className="animate-reaction-jump pointer-events-none absolute text-lg"
          style={
            {
              left: `calc(50% + ${f.x}px)`,
              top: "38%",
              "--r": `${f.rot}deg`,
            } as React.CSSProperties
          }
        >
          {f.r}
        </span>
      ))}

      {/* Content + transcript */}
      <div className="space-y-2 px-3 pb-3 pt-2">
        {hasTranscript && thought.transcript && (
          <TranscriptPanel
            segments={thought.transcript}
            language={thought.language}
            languageLabel={thought.languageLabel}
            currentTime={mediaTime}
            onSeek={seekTo}
          />
        )}
        <p lang={thought.language} dir="auto" className="text-sm leading-relaxed text-[var(--foreground)]">
          {thought.content}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {thought.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]"
            >
              {t}
            </span>
          ))}
        </div>

        {/* Reactions */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-[var(--border-base)] pt-2.5">
          {REACTION_TYPES.map((r) => {
            const count = reactions.find((e) => e.type === r)?.count ?? 0;
            const isMine = mine === r;
            return (
              <button
                key={r}
                onClick={() => react(r)}
                aria-label={`React ${r}`}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition active:scale-95 ${
                  isMine
                    ? "border-teal-300 bg-teal-50 text-teal-800"
                    : count > 0
                      ? "border-[var(--border-base)] bg-[var(--surface-2)] text-[var(--foreground)] hover:border-teal-200"
                      : "border-[var(--border-base)] bg-white text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                <span className="text-sm leading-none">{r}</span>
                {count > 0 && <span className="tabular-nums text-[10px]">{count}</span>}
              </button>
            );
          })}
        </div>

        {thought.feeling && others && others > 1 && onOpenRoom && (
          <button
            onClick={() => onOpenRoom(thought.feeling!)}
            className="mt-2 flex w-full items-center gap-2 rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] px-3 py-2 text-left text-[11px] font-medium text-[var(--muted)] transition hover:border-teal-200 hover:text-[var(--foreground)]"
          >
            <span className="min-w-0 flex-1">
              You&apos;re not alone — {others} other{others === 1 ? "" : "s"} feel this too
            </span>
            <span className="shrink-0 text-[var(--accent)]">Open room</span>
          </button>
        )}
      </div>

      {/* Report sheet */}
      {(reporting || reported) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 backdrop-blur-sm sm:items-center">
          <div
            className="absolute inset-0"
            onClick={() => {
              setReporting(false);
              setReported(false);
            }}
          />
          <div className="relative w-full max-w-md rounded-t-2xl border border-[var(--border-base)] bg-white p-5 shadow-xl shadow-slate-900/10 sm:rounded-2xl">
            {reported ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <ShieldCheck className="h-9 w-9 text-emerald-600" />
                <p className="text-sm font-semibold text-[var(--foreground)]">Thanks — reported</p>
                <p className="text-xs text-[var(--muted)]">
                  Our community keepers review every report. This take stays up until it&apos;s
                  reviewed.
                </p>
                <button
                  onClick={() => {
                    setReported(false);
                    setReporting(false);
                  }}
                  className="mt-1 w-full rounded-xl border border-[var(--border-base)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-2)]"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-[var(--foreground)]">Report this take</h3>
                  <span className="text-[11px] text-[var(--muted)]">All ages. Stay kind.</span>
                </div>
                <div className="flex flex-col gap-2">
                  {REPORT_REASONS.map((reason) => (
                    <button
                      key={reason}
                      onClick={() => {
                        setReported(true);
                        onReport?.(thought.id, reason);
                      }}
                      className="flex items-center gap-2 rounded-xl border border-[var(--border-base)] bg-[var(--surface-2)] px-3 py-2.5 text-left text-sm text-[var(--foreground)] transition hover:border-teal-200"
                    >
                      <Flag className="h-4 w-4 shrink-0 text-rose-500" />
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
        integrity={thought.integrity}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />
    </article>
  );
}
