"use client";

import { useEffect, useState } from "react";
import { X, AudioLines, Video, Type, Send, Globe, ChevronDown } from "lucide-react";
import { LANGS } from "@/lib/mock-data";
import { BRAND, SUGGESTED_TAGS } from "@/lib/brand";
import { checkDignity, normalizeTag } from "@/lib/dignity";
import { checkContentQuality } from "@/lib/anti-abuse";
import { fakeHash } from "@/lib/integrity";
import { FEELINGS } from "@/lib/feelings";
import { dailyPrompt, todayKey, weeklyTheme } from "@/lib/daily-prompt";
import type { FeelingId, MediaType, Thought, PublishResult } from "@/lib/types";
import MediaRecorderView, { type CapturedClip } from "@/components/Submit/MediaRecorderView";
import TextForm from "@/components/Submit/TextForm";
import FeelWithPeers from "@/components/FeelWithPeers";
import SharedSpectrum from "@/components/SharedSpectrum";

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
  /** Tag this share as answering today’s ritual prompt. */
  fromDailyPrompt?: boolean;
  lockedIdentity?: boolean;
  signedIn?: boolean;
  onFeelWith?: (handle: string) => void | Promise<void>;
  onBrowseToday?: () => void;
}

const TABS: { id: Tab; label: string; icon: typeof AudioLines }[] = [
  { id: "text", label: "Text", icon: Type },
  { id: "audio", label: "Audio", icon: AudioLines },
  { id: "video", label: "Video", icon: Video },
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
  fromDailyPrompt = false,
  lockedIdentity = false,
  signedIn = false,
  onFeelWith,
  onBrowseToday,
}: SubmitModalProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [handle, setHandle] = useState(presetHandle);
  const [author, setAuthor] = useState(presetAuthor);
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState("");
  const [language, setLanguage] = useState(detectDefaultLanguage);
  const [feeling, setFeeling] = useState<FeelingId | undefined>(presetFeeling);
  const [published, setPublished] = useState(false);
  const [publishedAsPrompt, setPublishedAsPrompt] = useState(false);
  const [captured, setCaptured] = useState<CapturedClip | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFeeling(presetFeeling);
  }, [open, presetFeeling]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const toggleTag = (t: string) =>
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t].slice(0, 8)));

  const addCustomTag = () => {
    const t = normalizeTag(customTag);
    if (!t) return;
    setTags((prev) => (prev.includes(t) ? prev : [...prev, t].slice(0, 8)));
    setCustomTag("");
  };

  const canSubmit =
    handle.trim().length > 0 &&
    !!feeling &&
    (tab === "text" ? content.trim().length >= 3 : !!captured?.blob);

  const switchTab = (t: Tab) => {
    setTab(t);
    setCaptured(null);
    setPublishError(null);
  };

  const submit = async () => {
    if (tab === "text" && content.trim().length < 3) return;
    if (tab !== "text" && !captured?.blob) return;
    if (!handle.trim()) return;
    setPublishError(null);

    const handleValue = handle.startsWith("@")
      ? handle.trim()
      : `@${handle.trim().toLowerCase().replace(/\s+/g, "")}`;
    const contentValue =
      tab === "text"
        ? content.trim()
        : content.trim() ||
          (tab === "audio"
            ? "An audio take shared in Voices."
            : "A video take shared in Voices.");

    const dignity = checkDignity(contentValue);
    if (!dignity.ok) {
      setPublishError(dignity.reason);
      return;
    }
    const quality = checkContentQuality(contentValue, { newAccount: false });
    if (!quality.ok) {
      setPublishError(quality.reason);
      return;
    }

    const seed = `${tab}:${handleValue}:${contentValue.slice(0, 40)}:${Date.now()}`;
    const langInfo = LANGS.find((l) => l.code === language);
    const day = todayKey();
    const payload: SharePayload = {
      author: author.trim() || handle.trim(),
      handle: handleValue,
      content: contentValue,
      mediaType: tab,
      feeling,
      mediaDuration: captured && captured.duration > 0 ? fmtDur(captured.duration) : undefined,
      mediaUrl: undefined,
      tags: tags.length ? tags : [],
      timestamp: new Date().toISOString(),
      language: langInfo?.code ?? "en",
      languageLabel: langInfo?.label ?? "English",
      integrity: {
        hash: fakeHash(seed),
        verified: false,
        statusLabel: tab === "text" ? "Signed on post" : "Pending signature",
      },
      ...(fromDailyPrompt
        ? { promptDay: day, promptText: dailyPrompt() }
        : {}),
    };

    let result: PublishResult;
    try {
      result = await onPublish(payload, tab !== "text" ? (captured ?? undefined) : undefined);
    } catch (e) {
      console.error("publish failed:", e);
      setPublishError(e instanceof Error ? e.message : "Couldn’t share right now. Try again.");
      return;
    }
    if (!result.ok) {
      if (result.reason === "cooldown") {
        setPublishError(
          `You just shared — wait ${result.retryInSec}s, then try again.`
        );
      } else if (result.reason === "too_long") {
        setPublishError(`A little long — keep it under ${result.max} characters.`);
      } else if (result.reason === "auth") {
        setPublishError("Sign in to share your feeling.");
      } else if (result.reason === "blocked") {
        setPublishError(result.message);
      } else if (result.reason === "failed" && result.message) {
        setPublishError(result.message);
      } else {
        setPublishError("Couldn’t share right now. Try again in a moment.");
      }
      return;
    }
    setPublishedAsPrompt(Boolean(fromDailyPrompt));
    setPublished(true);
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[var(--background)]/95 backdrop-blur-md">
      <div className="safe-top border-b border-[var(--border-base)] bg-[var(--surface)]">
        <div className="app-rail flex items-center justify-between py-3">
          <button
            onClick={onClose}
            className="flex items-center gap-1 rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
            aria-label="Back"
          >
            <X className="h-5 w-5" />
            <span className="text-sm font-medium">Cancel</span>
          </button>
          <h2 className="font-display text-sm font-semibold text-[var(--foreground)]">
            {BRAND.shareTitle}
          </h2>
          <span className="w-16" />
        </div>
      </div>

      {published ? (
        publishedAsPrompt && onFeelWith && onBrowseToday ? (
          <FeelWithPeers
            day={todayKey()}
            signedIn={signedIn}
            onFeelWith={onFeelWith}
            onDone={onClose}
            onBrowseToday={() => {
              onBrowseToday();
              onClose();
            }}
          />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="text-4xl text-[var(--accent)]" aria-hidden>
              ◌
            </span>
            <h3 className="font-display text-lg font-bold text-[var(--foreground)]">
              {BRAND.shareSuccess}
            </h3>
            <p className="text-sm text-[var(--muted)]">{BRAND.shareSuccessSub}</p>
            <div className="w-full max-w-sm text-left">
              <SharedSpectrum />
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 rounded-full bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--surface)]"
            >
              See it in Voices
            </button>
          </div>
        )
      ) : (
        <>
          <div className="app-rail flex flex-1 flex-col overflow-y-auto">
            {fromDailyPrompt && (
              <p className="border-b border-[var(--border-base)] bg-[var(--accent-soft)]/40 px-4 py-2 text-xs leading-relaxed text-[var(--accent-2)]">
                <span className="font-semibold">{weeklyTheme()} · </span>
                {dailyPrompt()}
              </p>
            )}
            <div className="pt-3">
              <div className="relative grid grid-cols-3 rounded-full bg-[var(--surface-2)] p-1">
                <span
                  aria-hidden
                  className="absolute inset-y-1 left-1 rounded-full bg-[var(--surface)] shadow-sm transition-transform duration-200 ease-out"
                  style={{
                    width: "calc((100% - 0.5rem) / 3)",
                    transform: `translateX(${TABS.findIndex((t) => t.id === tab) * 100}%)`,
                  }}
                />
                {TABS.map(({ id, label, icon: Icon }) => {
                  const active = tab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => switchTab(id)}
                      className={`relative z-10 flex items-center justify-center gap-1.5 rounded-full py-2 text-sm font-medium transition ${
                        active ? "text-[var(--foreground)]" : "text-[var(--muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex-1 space-y-4 bg-[var(--background)] py-4">
              {tab === "audio" && <MediaRecorderView kind="audio" onCaptured={setCaptured} />}
              {tab === "video" && <MediaRecorderView kind="video" onCaptured={setCaptured} />}
              {tab === "text" && <TextForm value={content} onChange={setContent} />}

              <div>
                <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
                  {FEELINGS.map((f) => {
                    const active = feeling === f.id;
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setFeeling(f.id)}
                        className={`shrink-0 rounded-full border px-3 py-2 text-left transition ${
                          active
                            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]"
                            : `${f.chip} opacity-90 hover:border-[var(--accent)]`
                        }`}
                      >
                        <span className="block text-xs font-semibold">{f.short}</span>
                        <span className="mt-0.5 block max-w-[9rem] truncate text-[10px] opacity-80">
                          {f.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {feeling && (
                  <p className="mt-2 text-xs font-medium text-[var(--accent)]">
                    {FEELINGS.find((f) => f.id === feeling)?.label}
                  </p>
                )}
              </div>

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
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                      Handle
                    </label>
                    <input
                      value={handle}
                      onChange={(e) => setHandle(e.target.value)}
                      placeholder="@yourname"
                      className="w-full rounded-lg border border-[var(--border-base)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-[var(--muted)]">
                      Display name <span className="opacity-70">(optional)</span>
                    </label>
                    <input
                      value={author}
                      onChange={(e) => setAuthor(e.target.value)}
                      placeholder="Your name"
                      className="w-full rounded-lg border border-[var(--border-base)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>
              )}

              {tab !== "text" && (
                <input
                  value={content}
                  onChange={(e) => setContent(e.target.value.slice(0, 500))}
                  placeholder="Add a caption…"
                  dir="auto"
                  className="w-full rounded-lg border border-[var(--border-base)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              )}

              <details className="group rounded-xl border border-[var(--border-base)] bg-white open:pb-3">
                <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm font-medium text-[var(--foreground)] [&::-webkit-details-marker]:hidden">
                  More options
                  <ChevronDown className="h-4 w-4 text-[var(--muted)] transition-transform group-open:rotate-180" />
                </summary>
                <div className="space-y-3 px-3 pt-1">
                  <div className="relative">
                    <Globe className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full cursor-pointer appearance-none rounded-lg border border-[var(--border-base)] bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-[var(--accent)]"
                    >
                      {LANGS.map((l) => (
                        <option key={l.code} value={l.code}>
                          {l.flag ? `${l.flag} ${l.label}` : l.label}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED_TAGS.map((t) => {
                      const active = tags.includes(t);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleTag(t)}
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                            active
                              ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]"
                              : "border-[var(--border-base)] bg-white text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--foreground)]"
                          }`}
                        >
                          {t}
                        </button>
                      );
                    })}
                    {tags
                      .filter((t) => !(SUGGESTED_TAGS as readonly string[]).includes(t))
                      .map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => toggleTag(t)}
                          className="rounded-full border border-[var(--accent)] bg-[var(--accent-soft)] px-2.5 py-1 text-xs font-medium text-[var(--accent-2)]"
                        >
                          {t} ×
                        </button>
                      ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={customTag}
                      onChange={(e) => setCustomTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          addCustomTag();
                        }
                      }}
                      placeholder="Add your own tag…"
                      className="min-w-0 flex-1 rounded-lg border border-[var(--border-base)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      type="button"
                      onClick={addCustomTag}
                      className="shrink-0 rounded-lg border border-[var(--border-base)] px-3 text-xs font-semibold text-[var(--foreground)] hover:bg-[var(--surface-2)]"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </details>

              <p className="text-[11px] leading-relaxed text-[var(--muted)]">
                {BRAND.dignityNote}
              </p>
            </div>
          </div>

          <div className="safe-bottom border-t border-[var(--border-base)] bg-[var(--surface)] py-3">
            <div className="app-rail flex flex-col gap-1.5">
              {publishError && (
                <p className="text-center text-[11px] font-medium text-rose-700">{publishError}</p>
              )}
              <button
                onClick={submit}
                disabled={!canSubmit}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)] disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
                {BRAND.shareCta}
              </button>
              <p className="text-center text-[11px] text-[var(--muted)]">
                {!feeling
                  ? "Choose how this feels"
                  : tab === "text"
                    ? "Write at least a few words"
                    : "Record a short clip"}
                {handle.trim() ? "" : " · add a handle"}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
