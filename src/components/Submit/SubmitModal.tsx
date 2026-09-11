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
  lockedIdentity?: boolean;
}

const TABS: { id: Tab; label: string; icon: typeof AudioLines }[] = [
  { id: "video", label: "Video", icon: Video },
  { id: "audio", label: "Audio", icon: AudioLines },
  { id: "text", label: "Text", icon: Type },
];

function detectDefaultLanguage(): string {
  if (typeof navigator === "undefined") return "en";
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of candidates) {
    const primary = tag?.split("-")[0]?.toLowerCase();
    if (primary && LANGS.some((l) => l.code === primary)) return primary;
  }
  return "en";
}

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
  lockedIdentity = false,
}: SubmitModalProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [feeling, setFeeling] = useState<FeelingId | null>(presetFeeling ?? null);
  const [handle, setHandle] = useState(presetHandle);
  const [author, setAuthor] = useState(presetAuthor);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [language, setLanguage] = useState(detectDefaultLanguage);
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
    feeling !== null &&
    handle.trim().length > 0 &&
    (tab === "text" ? content.trim().length >= 3 : !!captured?.blob);

  const switchTab = (t: Tab) => {
    setTab(t);
    setCaptured(null);
    setPublishError(null);
  };

  const submit = async () => {
    if (!feeling) return;
    if (tab === "text" && content.trim().length < 3) return;
    if (tab !== "text" && !captured?.blob) return;
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
    <div className="fixed inset-0 z-50 flex flex-col bg-[var(--background)]/95 backdrop-blur-md">
      {/* Top bar */}
      <div className="safe-top flex items-center justify-between border-b border-[var(--border-base)] bg-[var(--surface)] px-4 py-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1 rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
          aria-label="Back"
        >
          <X className="h-5 w-5" />
          <span className="text-sm font-medium">Cancel</span>
        </button>
        <div className="flex items-center gap-1.5">
          <Heart className="h-4 w-4 text-[var(--accent)]" fill="currentColor" />
          <h2 className="font-display text-sm font-semibold text-[var(--foreground)]">How do you feel?</h2>
        </div>
        <span className="w-16" />
      </div>

      {published ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <span className="animate-pop-in text-4xl text-[var(--accent)]" aria-hidden>
            ◌
          </span>
          <h3 className="font-display text-lg font-bold text-[var(--foreground)]">It&apos;s on the pulse.</h3>
          <p className="text-sm text-[var(--muted)]">Your feeling is out there — people are feeling with you right now.</p>
          <span className="animate-reaction-drip mt-1 flex items-center gap-1.5 rounded-full bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800">
            <Check className="h-3.5 w-3.5" /> Live
          </span>
        </div>
      ) : (
        <>
          <div className="mx-auto flex w-full max-w-[430px] flex-1 flex-col overflow-y-auto">
            {/* Feeling picker — the heart of the app */}
            <section className="border-b border-[var(--border-base)] bg-[var(--surface)] px-4 pb-3 pt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
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
                          ? "border-teal-300 bg-teal-50 text-teal-900"
                          : "border-[var(--border-base)] bg-white text-[var(--foreground)] hover:border-teal-200"
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
            <div className="grid grid-cols-3 border-b border-[var(--border-base)] bg-[var(--surface)]">
              {TABS.map(({ id, label, icon: Icon }) => {
                const active = tab === id;
                return (
                  <button
                    key={id}
                    onClick={() => switchTab(id)}
                    className={`relative flex items-center justify-center gap-1.5 py-3 text-sm font-medium transition ${
                      active ? "text-[var(--accent)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    {active && (
                      <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-[var(--accent)]" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 space-y-4 bg-[var(--background)] px-4 py-4">
              {tab === "audio" && <MediaRecorderView kind="audio" onCaptured={setCaptured} />}
              {tab === "video" && <MediaRecorderView kind="video" onCaptured={setCaptured} />}
              {tab === "text" && <TextForm value={content} onChange={setContent} />}

              {/* Handle + name */}
              {lockedIdentity ? (
                <div className="flex items-center gap-3 rounded-lg border border-[var(--border-base)] bg-white px-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                    {(author || handle).replace("@", "").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 leading-tight">
                    <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                      {author || handle}
                    </p>
                    <p className="truncate text-xs text-[var(--muted)]">Posting as {handle}</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                      Handle
                    </label>
                    <input
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder="@yourname"
                      inputMode="text"
                      className="w-full rounded-lg border border-[var(--border-base)] bg-white px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                      Display name <span className="normal-case text-[var(--muted)]/70">(optional)</span>
                    </label>
                    <input
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder="Your name"
                      className="w-full rounded-lg border border-[var(--border-base)] bg-white px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {tab !== "text" && (
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                    One line on it <span className="normal-case text-[var(--muted)]/70">(optional)</span>
                  </label>
                  <input
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="What's on your mind?"
                    dir="auto"
                    className="w-full rounded-lg border border-[var(--border-base)] bg-white px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)] focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Language <span className="normal-case text-[var(--muted)]/70">(speak any language)</span>
                </label>
                <div className="relative">
                  <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    aria-label="Take language"
                    className="w-full cursor-pointer appearance-none rounded-lg border border-[var(--border-base)] bg-white py-2 pl-9 pr-9 text-sm text-[var(--foreground)] focus:border-[var(--accent)] focus:outline-none"
                  >
                    {LANGS.map((l) => (
                      <option key={l.code} value={l.code}>
                        {l.flag ? `${l.flag} ${l.label}` : l.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
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
                            ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                            : "border-[var(--border-base)] bg-white text-[var(--muted)] hover:border-teal-200 hover:text-[var(--foreground)]"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>

              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
                All ages, all languages, all feelings — here it&apos;s safe to say how you really
                feel about AI. Be kind.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="safe-bottom border-t border-[var(--border-base)] bg-[var(--surface)] px-4 py-3">
            <div className="mx-auto flex w-full max-w-[430px] flex-col gap-1.5">
              {publishError && (
                <p className="text-center text-[11px] font-medium text-rose-600">
                  {publishError}
                </p>
              )}
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
                Put It On The Pulse
              </button>
              <p className="text-center text-[11px] text-[var(--muted)]">
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
