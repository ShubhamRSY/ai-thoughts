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
import { feelingOf } from "@/lib/feelings";
import AudioPlayer from "@/components/Player/AudioPlayer";
import VideoPlayer from "@/components/Player/VideoPlayer";
import IntegrityBadge from "@/components/IntegrityBadge";
import TranscriptPanel from "@/components/Feed/TranscriptPanel";
import FeelingBadge from "@/components/FeelingBadge";
import ChatPanel from "@/components/Chat/ChatPanel";

// Initials avatar with deterministic gradient
const GRADIENTS = [
  "from-violet-500 to-indigo-500",
  "from-fuchsia-500 to-pink-500",
  "from-sky-500 to-cyan-500",
  "from-emerald-500 to-teal-500",
  "from-amber-500 to-orange-500",
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

export default function FeedCard({ thought, onReact, onReport, onOpenRoom, others }: FeedCardProps) {
  const [reactions, setReactions] = useState(thought.reactions);
  const [mine, setMine] = useState<Reaction | null>(null);
  const [burst, setBurst] = useState<Reaction | null>(null);
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
    <article className="animate-rise-in overflow-hidden rounded-2xl border border-zinc-800/70 bg-[#141419]/95 shadow-sm shadow-black/20 ring-1 ring-inset ring-white/[0.03]">
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
            <span className="truncate text-sm font-semibold text-zinc-100">
              {thought.author}
            </span>
            <span className="shrink-0 whitespace-nowrap text-xs text-zinc-600">
              · {thought.timeLabel}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <FeelingBadge feeling={thought.feeling} size="sm" />
            {thought.languageLabel && (
              <span className="flex items-center gap-1 rounded-md bg-zinc-800/60 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
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
            className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-9 z-20 w-44 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900 shadow-xl">
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    setReporting(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-zinc-300 transition hover:bg-zinc-800"
                >
                  <Flag className="h-4 w-4 text-rose-400" />
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
      <div className="flex items-center gap-3 px-3 pt-3 text-zinc-400">
        <button
          onClick={like}
          aria-label={liked ? "Unlike" : "Like"}
          className={`transition active:scale-90 ${liked ? "text-rose-500" : "hover:text-zinc-200"}`}
        >
          <Flame className="h-[22px] w-[22px]" fill={liked ? "currentColor" : "none"} strokeWidth={2.2} />
        </button>
        <button
          onClick={() => setChatOpen(true)}
          className="transition hover:text-zinc-200"
          aria-label="Comment"
        >
          <MessageCircle className="h-[22px] w-[22px]" strokeWidth={2.2} />
        </button>
        <button
          onClick={() => setSaved((v) => !v)}
          aria-label="Save"
          className={`ml-auto transition active:scale-90 ${
            saved ? "text-violet-400" : "hover:text-zinc-200"
          }`}
        >
          <Bookmark className="h-[22px] w-[22px]" fill={saved ? "currentColor" : "none"} strokeWidth={2.2} />
        </button>
      </div>

      {/* Liked / reacted strip */}
      <div className="px-3 pt-2 text-[11px] font-medium text-zinc-400">
        <span className="tabular-nums">
          {likes + reactions.reduce((s, e) => s + e.count, 0)} feel{likes ? "" : "s"}
        </span>
        <span className="text-zinc-600"> · {thought.handle}</span>
      </div>

      {/* Feeling + reaction burst */}
      {burst && (
        <div className="px-3 pt-2">
          <span className="animate-pop-in inline-flex items-center gap-1 rounded-full bg-zinc-800 px-3 py-1 text-sm shadow-lg">
            {burst} You feel this too
          </span>
        </div>
      )}

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
        <p lang={thought.language} dir="auto" className="text-sm leading-relaxed text-zinc-300">
          {thought.content}
        </p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {thought.tags.map((t) => (
            <span
              key={t}
              className="rounded-full bg-zinc-800/60 px-2 py-0.5 text-[11px] font-medium text-zinc-400"
            >
              #{t}
            </span>
          ))}
        </div>

        {/* Reactions — always visible so you know how to express */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-zinc-800/70 pt-2.5">
          <span className="mr-0.5 text-[10px] font-medium uppercase tracking-wider text-zinc-600">
            React
          </span>
          {REACTION_TYPES.map((r) => {
            const count = reactions.find((e) => e.type === r)?.count ?? 0;
            const isMine = mine === r;
            return (
              <button
                key={r}
                onClick={() => react(r)}
                aria-label={`React ${r}`}
                className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition active:scale-90 ${
                  isMine
                    ? "border-violet-500/70 bg-violet-500/20 text-violet-100"
                    : count > 0
                      ? "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700"
                      : "border-transparent bg-transparent text-zinc-600 hover:text-zinc-300"
                }`}
              >
                <span className="text-sm leading-none">{r}</span>
                {count > 0 && <span className="tabular-nums">{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Safety in numbers — others feel this too */}
        {thought.feeling && others && others > 1 && onOpenRoom && (
          <button
            onClick={() => onOpenRoom(thought.feeling!)}
            className="mt-2 flex w-full items-center gap-1.5 rounded-lg border border-zinc-800/70 bg-zinc-900/40 px-2.5 py-1.5 text-[11px] font-medium text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
          >
            <span aria-hidden className="text-sm leading-none">
              🤝
            </span>
            You&apos;re not alone — {others} others feel {feelingOf(thought.feeling)?.short.toLowerCase()} too
            <span className="ml-auto text-zinc-600">open room →</span>
          </button>
        )}
      </div>

      {/* Report sheet */}
      {(reporting || reported) && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
          <div
            className="absolute inset-0"
            onClick={() => {
              setReporting(false);
              setReported(false);
            }}
          />
          <div className="relative w-full max-w-[430px] rounded-t-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl sm:rounded-2xl">
            {reported ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <ShieldCheck className="h-9 w-9 text-emerald-400" />
                <p className="text-sm font-semibold text-zinc-100">Thanks — reported</p>
                <p className="text-xs text-zinc-400">
                  Our community keepers review every report. This take stays up until it&apos;s
                  reviewed.
                </p>
                <button
                  onClick={() => {
                    setReported(false);
                    setReporting(false);
                  }}
                  className="mt-1 w-full rounded-xl border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-200 transition hover:bg-zinc-800"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-zinc-100">Report this take</h3>
                  <span className="text-[11px] text-zinc-500">All ages. Stay kind.</span>
                </div>
                <div className="flex flex-col gap-2">
                  {REPORT_REASONS.map((reason) => (
                    <button
                      key={reason}
                      onClick={() => {
                        setReported(true);
                        onReport?.(thought.id, reason);
                      }}
                      className="flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5 text-left text-sm text-zinc-300 transition hover:border-zinc-700 hover:text-zinc-100"
                    >
                      <Flag className="h-4 w-4 shrink-0 text-rose-400" />
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