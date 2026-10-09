"use client";

import { useEffect, useRef, useState } from "react";
import { X, AudioLines, Video, Type, Send, ChevronDown } from "lucide-react";
import { LANGS } from "@/lib/mock-data";
import { BRAND, SUGGESTED_TAGS } from "@/lib/brand";
import { normalizeTag } from "@/lib/dignity";
import { checkContentQuality } from "@/lib/anti-abuse";
import { fakeHash } from "@/lib/integrity";
import { FEELINGS, CHIP_SOFT } from "@/lib/feelings";
import { dailyPrompt, todayKey, weeklyTheme } from "@/lib/daily-prompt";
import type { FeelingId, MediaType, Thought, PublishResult } from "@/lib/types";
import MediaRecorderView, { type CapturedClip } from "@/components/Submit/MediaRecorderView";
import TextForm from "@/components/Submit/TextForm";
import FeelWithPeers from "@/components/FeelWithPeers";
import SharedSpectrum from "@/components/SharedSpectrum";
import PublishSuccessActions from "@/components/Submit/PublishSuccessActions";

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
  initialTab = "text",
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
  const [language] = useState(detectDefaultLanguage);
  const [feeling, setFeeling] = useState<FeelingId | undefined>(presetFeeling);
  const [customFeeling, setCustomFeeling] = useState("");
  const [published, setPublished] = useState(false);
  const [publishedAsPrompt, setPublishedAsPrompt] = useState(false);
  const [publishedThought, setPublishedThought] = useState<Thought | null>(null);
  const [captured, setCaptured] = useState<CapturedClip | null>(null);
  const [image, setImage] = useState<File | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);
  /** Instagram-style "uploading" state with a progress bar before landing in the feed. */
  const [publishing, setPublishing] = useState(false);
  const [publishProgress, setPublishProgress] = useState(0);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    setFeeling(presetFeeling);
    setCustomFeeling("");
  }, [open, presetFeeling]);

  // ---- offline autosave: a half-written take survives accidental closes ----
  const DRAFT_KEY = "aito.draft.v1";
  const [draftHint, setDraftHint] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as { content?: string; tags?: string[]; savedAt?: string };
      if (d?.content?.trim()) {
        setContent(d.content);
        setTags(Array.isArray(d.tags) ? d.tags.slice(0, 8) : []);
        setDraftHint("Draft restored. Safe to edit and post.");
      }
    } catch {
      /* unreadable draft — ignore */
    }
  }, [open]);

  useEffect(() => {
    if (!open || content.trim().length === 0) return;
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(
          DRAFT_KEY,
          JSON.stringify({ content, tags, savedAt: new Date().toISOString() })
        );
      } catch {
        /* storage full/unavailable — draft just won't persist */
      }
    }, 350);
    return () => window.clearTimeout(t);
  }, [open, content, tags]);

  const clearDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      /* ignore */
    }
    setDraftHint(null);
  };

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
    (tab === "text" ? content.trim().length >= 3 : !!captured?.blob);

  const switchTab = (t: Tab) => {
    setTab(t);
    setCaptured(null);
    setImage(null);
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

    const quality = checkContentQuality(contentValue, { newAccount: false });
    if (!quality.ok) {
      setPublishError(quality.reason);
      return;
    }

    const customFeelingValue = feeling === "custom" ? customFeeling.trim() : "";
    // A "Custom" pick with nothing typed isn't a real feeling — same as not picking one.
    const feelingValue = feeling === "custom" && !customFeelingValue ? undefined : feeling;

    const seed = `${tab}:${handleValue}:${contentValue.slice(0, 40)}:${Date.now()}`;
    const langInfo = LANGS.find((l) => l.code === language);
    const day = todayKey();
    const payload: SharePayload = {
      author: author.trim() || handle.trim(),
      handle: handleValue,
      content: contentValue,
      mediaType: tab,
      feeling: feelingValue,
      customFeeling: feelingValue === "custom" ? customFeelingValue : undefined,
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

    const clip =
      tab !== "text"
        ? (captured ?? undefined)
        : image
          ? { blob: image, duration: 0 }
          : undefined;

    // Client-side guardrails before anything hits the wire — the server enforces
    // the same caps, but failing fast beats uploading 150MB into a dead-end.
    if (captured?.blob && captured.blob.size > 150 * 1024 * 1024) {
      setPublishError("That clip is over 150 MB. Keep takes to 150 MB or under.");
      return;
    }
    if (captured?.duration && captured.duration > 600) {
      setPublishError("Takes are capped at 10 minutes.");
      return;
    }

    // Instagram-style: upload progress bar, then drop straight into the feed.
    setPublishing(true);
    setPublishProgress(5);
    let progress = 5;
    progressTimer.current = setInterval(() => {
      progress = Math.min(88, progress + (progress < 40 ? 5 : 2));
      setPublishProgress(progress);
    }, 130);

    const stopLoading = () => {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
    };

    let result: PublishResult;
    try {
      result = await onPublish(payload, clip);
    } catch (e) {
      console.error("publish failed:", e);
      stopLoading();
      setPublishing(false);
      setPublishProgress(0);
      setPublishError(e instanceof Error ? e.message : "Couldn’t share right now. Try again.");
      return;
    }
    if (!result.ok) {
      stopLoading();
      setPublishing(false);
      setPublishProgress(0);
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

    stopLoading();
    setPublishProgress(100);
    clearDraft();
    setPublishedAsPrompt(Boolean(fromDailyPrompt));
    setPublishedThought(result.thought ?? null);
    if (fromDailyPrompt) {
      setPublishing(false);
      setPublished(true);
    } else {
      // Let the bar finish, then close the composer so the focused post shows in the feed.
      // Keep `publishing` true until then so the "Shared!" state stays on screen.
      window.setTimeout(onClose, 400);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-[var(--background)]/95 backdrop-blur-md">
      <div className="safe-top border-b border-[var(--border-base)] bg-[var(--surface)]">
        <div className="app-rail flex items-center justify-between py-3">
          <button
            onClick={onClose}
            disabled={publishing}
            className="flex items-center gap-1 rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)] disabled:opacity-40"
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
          <div className="flex flex-1 flex-col overflow-y-auto">
            {publishedThought && (
              <div className="flex justify-center border-b border-[var(--border-base)] px-4 py-3">
                <PublishSuccessActions thought={publishedThought} compact />
              </div>
            )}
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
          </div>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 overflow-y-auto px-6 py-8 text-center">
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
            {publishedThought && <PublishSuccessActions thought={publishedThought} />}
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
          {publishing && (
        <div className="flex flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-6 py-10 text-center">
          <span className="relative flex h-14 w-14 items-center justify-center">
            <span className="absolute inset-0 rounded-full border-2 border-[var(--accent-soft)]" />
            <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-[var(--accent)]" />
            <Send className="h-5 w-5 text-[var(--accent)]" />
          </span>
          <div className="w-full max-w-[15rem]">
            <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-2)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-200 ease-out"
                style={{ width: `${publishProgress}%` }}
              />
            </div>
          </div>
          <p className="text-sm font-medium text-[var(--muted)]">
            {publishProgress >= 100 ? "Shared!" : "Sharing your feeling…"}
          </p>
        </div>
          )}
          {/* Hidden, not unmounted, while publishing: the recorder holds the clip, so a
              failed upload must hand the form back with the recording still in it. */}
          <div className={publishing ? "hidden" : "contents"}>
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
              {tab === "text" && (
                <TextForm value={content} onChange={setContent} image={image} onImageChange={setImage} />
              )}
              {draftHint && (
                <p className="flex items-center justify-between gap-3 text-[11px] text-[var(--muted)]">
                  <span>{draftHint}</span>
                  <button
                    type="button"
                    onClick={clearDraft}
                    className="font-medium text-[var(--accent)] hover:text-[var(--accent-2)]"
                  >
                    Discard draft
                  </button>
                </p>
              )}

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
                  <button
                    type="button"
                    onClick={() => setFeeling("custom")}
                    className={`shrink-0 rounded-full border px-3 py-2 text-left transition ${
                      feeling === "custom"
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]"
                        : `${CHIP_SOFT} opacity-90 hover:border-[var(--accent)]`
                    }`}
                  >
                    <span className="block text-xs font-semibold">Custom</span>
                    <span className="mt-0.5 block max-w-[9rem] truncate text-[10px] opacity-80">
                      Say it your way
                    </span>
                  </button>
                </div>
                {feeling === "custom" ? (
                  <input
                    value={customFeeling}
                    aria-label="How AI makes you feel, and your take"
                    onChange={(e) => setCustomFeeling(e.target.value.slice(0, 40))}
                    placeholder="How does AI make you feel? What’s your take?"
                    className="mt-2 w-full rounded-lg border border-[var(--border-base)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                  />
                ) : (
                  feeling && (
                    <p className="mt-2 text-xs font-medium text-[var(--accent)]">
                      {FEELINGS.find((f) => f.id === feeling)?.label}
                    </p>
                  )
                )}
              </div>

              {lockedIdentity ? (
                <div className="flex items-center gap-3 rounded-lg border border-[var(--border-base)] bg-white px-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xs font-bold text-white">
                    {handle.replace("@", "").slice(0, 1).toUpperCase()}
                  </div>
                  <p className="min-w-0 truncate text-sm text-[var(--muted)]">
                    Posting as <span className="font-semibold text-[var(--foreground)]">{handle}</span>
                  </p>
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
                  aria-label="Caption for your clip"
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
                      aria-label="Add your own tag"
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
                {tab === "text" ? "Write at least a few words" : "Record a short clip"}
                {handle.trim() ? "" : " · add a handle"}
              </p>
            </div>
          </div>
          </div>
        </>
      )}
    </div>
  );
}
