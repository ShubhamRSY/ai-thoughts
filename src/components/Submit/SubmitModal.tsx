"use client";

import { useEffect, useState } from "react";
import { X, AudioLines, Video, Type, Send, Check, Globe, ChevronDown, Heart } from "lucide-react";
import { TAG_OPTIONS, LANGS } from "@/lib/mock-data";
import { FEELINGS } from "@/lib/feelings";
import { fakeHash } from "@/lib/integrity";
import type { FeelingId, MediaType, Thought, PublishResult } from "@/lib/types";
import MediaRecorderView, { type CapturedClip } from "@/components/Submit/MediaRecorderView";
import TextForm from "@/components/Submit/TextForm";

type Tab = MediaType;

export type SharePayload = Omit<Thought, "id" | "reactions" | "timeLabel">;

interface SubmitModalProps {
  open: boolean;
  initialTab?: Tab;
  onClose: () => void;
  onPublish: (thought: SharePayload, clip?: CapturedClip) => Promise<PublishResult>;
  presetHandle?: string;
  presetAuthor?: string;
  presetFeeling?: FeelingId;
}

const TABS: { id: Tab; label: string; icon: typeof AudioLines }[] = [
  { id: "video", label: "Video", icon: Video },
  { id: "audio", label: "Audio", icon: AudioLines },
  { id: "text", label: "Text", icon: Type },
];

function fmtDur(s: number) {
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, "0")}`;
}

export default function SubmitModal({
  open,
  initialTab = "video",
  onClose,
  onPublish,
  presetHandle = "",
  presetAuthor = "",
  presetFeeling,
}: SubmitModalProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [feeling, setFeeling] = useState<FeelingId | null>(presetFeeling ?? null);
  const [handle, setHandle] = useState(presetHandle);
  const [author, setAuthor] = useState(presetAuthor);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [language, setLanguage] = useState("en");
  const [published, setPublished] = useState(false);
  const [captured, setCaptured] = useState<CapturedClip | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  const canSubmit =
    feeling !== null && handle.trim().length > 0 && (tab !== "text" || content.trim().length >= 3);

  const switchTab = (t: Tab) => {
    setTab(t);
    setCaptured(null);
    setPublishError(null);
  };

  const submit = async () => {
    if (!feeling) return;
    if (tab === "text" && content.trim().length < 3) return;
    if (!handle.trim()) return;
    setPublishError(null);
    const handleValue = handle.startsWith("@") ? handle.trim() : `@${handle.trim().toLowerCase().replace(/\s+/g, "")}`;
    const contentValue =
      tab === "text"
        ? content.trim()
        : content.trim() ||
          (tab === "audio"
            ? "A fresh audio take shared on the pulse."
            : "A quick video take shared on the pulse.");
    const seed = `${tab}:${feeling}:${handleValue}:${contentValue.slice(0, 40)}:${Date.now()}`;
    const langInfo = LANGS.find((l) => l.code === language);
    const payload: SharePayload = {
      author: author.trim() || handle.trim(),
      handle: handleValue,
      content: contentValue,
      mediaType: tab,
      feeling,
      mediaDuration: captured && captured.duration > 0 ? fmtDur(captured.duration) : undefined,
      mediaUrl: undefined,
      tags: tags.length ? tags : ["#Future"],
      timestamp: new Date().toISOString(),
      language: langInfo?.code ?? "en",
      languageLabel: langInfo?.label ?? "English",
      integrity: {
        hash: fakeHash(seed),
        verified: false,
        statusLabel: tab === "text" ? "Signed on post" : "Pending signature",
      },
    };

    const result = await onPublish(payload, tab !== "text" ? (captured ?? undefined) : undefined);
    if (!result.ok) {
      if (result.reason === "cooldown") {
        setPublishError(
          `You just shared — give it ${result.retryInSec}s. Take a breath, the pulse isn't going anywhere.`
        );
      } else if (result.reason === "too_long") {
        setPublishError(`That's a little long — keep it under ${result.max} characters.`);
      } else {
        setPublishError(
          "Couldn't share right now. If you're recording, check your clip and try again."
        );
      }
      return;
    }
    setPublished(true);
    setTimeout(() => onClose(), 1400);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950/95 backdrop-blur-md">
      {/* Top bar */}
      <div className="safe-top flex items-center justify-between border-b border-zinc-800/80 px-4 py-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded-lg p-1.5 text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
          aria-label="Back"
        >
          <X className="h-5 w-5" />
          <span className="text-sm font-medium">Cancel</span>
        </button>
        <div className="flex items-center gap-1.5">
          <Heart className="h-4 w-4 text-violet-400" fill="currentColor" />
          <h2 className="text-sm font-semibold text-zinc-100">How do you feel?</h2>
        </div>
        <span className="w-16" />
      </div>

      {published ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="animate-pop-in text-5xl">🌊</span>
          <h3 className="text-lg font-bold text-zinc-100">It&apos;s on the pulse.</h3>
          <p className="text-sm text-zinc-400">Your feeling is out there — people are feeling with you right now.</p>
          <span className="animate-reaction-drip mt-1 flex items-center gap-1.5 rounded-full bg-violet-500/15 px-3 py-1 text-xs font-medium text-violet-300">
            <Check className="h-3.5 w-3.5" /> Live
          </span>
        </div>
      ) : (
        <>
          <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col overflow-y-auto">
            {/* Feeling picker — the heart of the app */}
            <section className="border-b border-zinc-800/80 px-4 pb-3 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Right now, AI makes me feel…
              </p>
              <div className="mt-2.5 grid grid-cols-2 gap-2">
                {FEELINGS.map((f) => {
                  const active = feeling === f.id;
                  return (
                    <button
                      key={f.id}
                      onClick={() => setFeeling(f.id)}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition active:scale-95 ${
                        active
                          ? "border-violet-500/70 bg-violet-500/15 text-violet-100 shadow-lg shadow-violet-500/10"
                          : "border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700"
                      }`}
                    >
                      <span className="text-xl leading-none" aria-hidden>
                        {f.emoji}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-semibold">{f.label}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* Mode tabs */}
            <div className="grid grid-cols-3 border-b border-zinc-800/80">
              {TABS.map(({ id, label, icon: Icon }) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => switchTab(id)}
                    className={`relative flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition ${
                      active ? "text-violet-300" : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    {active && (
                      <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 space-y-4 px-4 py-4">
              {tab === "audio" && <MediaRecorderView kind="audio" onCaptured={setCaptured} />}
              {tab === "video" && <MediaRecorderView kind="video" onCaptured={setCaptured} />}
              {tab === "text" && <TextForm value={content} onChange={setContent} />}

              {/* Handle + name */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Handle
                  </label>
                  <input
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    placeholder="@yourname"
                    inputMode="text"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/60 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    Display name <span className="normal-case text-zinc-600">(optional)</span>
                  </label>
                  <input
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    placeholder="Your name"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/60 focus:outline-none"
                  />
                </div>
              </div>

              {tab !== "text" && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                    One line on it <span className="normal-case text-zinc-600">(optional)</span>
                  </label>
                  <input
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="What's on your mind?"
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/60 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Language <span className="normal-case text-zinc-600">(speak any language)</span>
                </label>
                <div className="relative">
                  <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    aria-label="Take language"
                    className="w-full cursor-pointer appearance-none rounded-lg border border-zinc-800 bg-zinc-900/60 py-2 pl-9 pr-9 text-sm text-zinc-100 focus:border-violet-500/60 focus:outline-none"
                  >
                    {LANGS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.flag ? `${l.flag} ${l.label}` : l.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Tags
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {TAG_OPTIONS.map((t) => {
                    const active = tags.includes(t);
                    return (
                      <button
                        key={t}
                        onClick={() => toggleTag(t)}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                          active
                            ? "border-emerald-500/60 bg-emerald-500/15 text-emerald-200"
                            : "border-zinc-800 bg-zinc-900/60 text-zinc-400 hover:border-zinc-700 hover:text-zinc-200"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-300/90">
                All ages, all languages, all feelings — here it&apos;s safe to say how you really
                feel about AI. Be kind. 🤝
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="safe-bottom border-t border-zinc-800/80 px-4 py-3">
            <div className="mx-auto flex w-full max-w-[430px] flex-col gap-1.5">
              {publishError && (
                <p className="text-center text-[11px] font-medium text-rose-400">
                  {publishError}
                </p>
              )}
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
              >
                <Send className="h-4 w-4" />
                Put It On The Pulse
              </button>
              <p className="text-center text-[11px] text-zinc-600">
                {!feeling ? "Pick how you feel" : tab === "text" ? "3+ characters" : "Record a clip"}
                {handle.trim() ? "" : " · add a handle"}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}