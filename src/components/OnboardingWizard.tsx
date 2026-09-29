"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, HeartHandshake, Send, UserRound } from "lucide-react";
import { FEELINGS, feelingOf } from "@/lib/feelings";
import { LANGS } from "@/lib/mock-data";
import { checkDignity } from "@/lib/dignity";
import { checkContentQuality } from "@/lib/anti-abuse";
import { fakeHash } from "@/lib/integrity";
import { dailyPrompt, todayKey } from "@/lib/daily-prompt";
import type { FeelingId, PublishResult } from "@/lib/types";
import type { SharePayload } from "@/components/Submit/SubmitModal";
import type { CapturedClip } from "@/components/Submit/MediaRecorderView";
import BrandMark from "@/components/BrandMark";
import SharedSpectrum from "@/components/SharedSpectrum";
import { useAuth } from "@/hooks/useAuth";

interface OnboardingPeer {
  handle: string;
  author: string;
  preview: string;
  post_id: string;
  feeling: string | null;
}

interface OnboardingWizardProps {
  identityHandle: string;
  identityAuthor: string;
  onPublish: (payload: SharePayload, clip?: CapturedClip) => Promise<PublishResult>;
  onFeelWith: (handle: string, next?: boolean) => void | Promise<void>;
  onDone: () => void;
}

type Step = "profile" | "feeling" | "words" | "together";

function detectDefaultLanguage(): string {
  if (typeof navigator === "undefined") return "en";
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const tag of candidates) {
    const primary = tag?.split("-")[0]?.toLowerCase();
    if (primary && LANGS.some((l) => l.code === primary)) return primary;
  }
  return "en";
}

const STEP_LABEL: Record<Step, string> = {
  profile: "1 of 4",
  feeling: "2 of 4",
  words: "3 of 4",
  together: "4 of 4",
};

/** Guided first-run: pick a feeling → say it in words → feel with others. */
export default function OnboardingWizard({
  identityHandle,
  identityAuthor,
  onPublish,
  onFeelWith,
  onDone,
}: OnboardingWizardProps) {
  const { refresh } = useAuth();
  const [step, setStep] = useState<Step>("profile");
  const [feeling, setFeeling] = useState<FeelingId | undefined>(undefined);
  const [text, setText] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [shared, setShared] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [peers, setPeers] = useState<OnboardingPeer[]>([]);
  const [peersLoading, setPeersLoading] = useState(true);
  const [felt, setFelt] = useState<Set<string>>(() => new Set());
  // Mandatory profile step (the "proper username" instead of an email-derived one).
  // Only new accounts land here, holding a placeholder name ("Voice") and a
  // random handle from sign-in — start blank so they pick real ones.
  const [profileName, setProfileName] = useState("");
  const [profileUsername, setProfileUsername] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Prefetch the "feel with" suggestions so step 3 is instant.
  useEffect(() => {
    if (step !== "together") return;
    let cancelled = false;
    fetch(`/api/prompt/peers?day=${encodeURIComponent(todayKey())}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled) setPeers(Array.isArray(data?.peers) ? data.peers : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setPeersLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [step]);

  const saveProfile = useCallback(async () => {
    const name = profileName.trim().slice(0, 80);
    const norm = profileUsername.trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, "");
    if (!name) {
      setProfileError("Add your display name — the name people see on your takes.");
      return;
    }
    if (norm.length < 3 || norm.length > 30 || !/^[a-z0-9_]+$/.test(norm)) {
      setProfileError("Username must be 3–30 letters, numbers, or underscores (no spaces, dots, or @).");
      return;
    }
    setProfileBusy(true);
    setProfileError(null);
    setSuggestions([]);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: `@${norm}`, author: name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileError(data.error || "Couldn’t save your profile — try again.");
        if (Array.isArray(data.suggestions)) setSuggestions(data.suggestions);
        return;
      }
      await refresh();
      setStep("feeling");
    } catch {
      setProfileError("Couldn’t save your profile — check your connection and try again.");
    } finally {
      setProfileBusy(false);
    }
  }, [profileName, profileUsername, refresh]);

  const submit = useCallback(async () => {
    if (!feeling) return;
    const content = text.trim();
    if (content.length < 3) {
      setPublishError("Say at least a few words — no polish required.");
      return;
    }

    const dignity = checkDignity(content);
    if (!dignity.ok) {
      setPublishError(dignity.reason);
      return;
    }
    const quality = checkContentQuality(content, { newAccount: true });
    if (!quality.ok) {
      setPublishError(quality.reason);
      return;
    }

    const handle =
      identityHandle.trim().startsWith("@")
        ? identityHandle.trim()
        : identityHandle.trim()
          ? `@${identityHandle.trim().toLowerCase().replace(/\s+/g, "")}`
          : "@newvoice";
    const langCode = detectDefaultLanguage();
    const lang = LANGS.find((l) => l.code === langCode);
    const seed = `onboarding:${handle}:${content.slice(0, 40)}:${Date.now()}`;

    const payload: SharePayload = {
      author: identityAuthor.trim() || handle.replace(/^@/, ""),
      handle,
      content,
      mediaType: "text",
      feeling,
      tags: [],
      timestamp: new Date().toISOString(),
      language: lang?.code ?? "en",
      languageLabel: lang?.label ?? "English",
      integrity: {
        hash: fakeHash(seed),
        verified: false,
        statusLabel: "Signed on post",
      },
      promptDay: todayKey(),
      promptText: dailyPrompt(),
    };

    setPublishing(true);
    setPublishError(null);
    const result = await onPublish(payload);
    setPublishing(false);
    if (!result.ok) {
      if (result.reason === "cooldown") {
        setPublishError(`You just shared — wait ${result.retryInSec}s, then try again.`);
      } else if (result.reason === "too_long") {
        setPublishError(`A little long — keep it under ${result.max} characters.`);
      } else if (result.reason === "blocked") {
        setPublishError(result.message);
      } else if (result.reason === "failed" && result.message) {
        setPublishError(result.message);
      } else {
        setPublishError("Couldn’t share right now. Try again in a moment.");
      }
      return;
    }
    setShared(true);
    window.setTimeout(() => setStep("together"), 650);
  }, [feeling, text, identityHandle, identityAuthor, onPublish]);

  const firstName = (identityAuthor.trim().split(/\s+/)[0] || "friend").replace(/^@/, "");
  const stepNum = STEP_LABEL[step];

  return (
    <div className="fixed inset-0 z-[85] flex flex-col overflow-y-auto bg-[var(--background)]">
      <header className="safe-top sticky top-0 z-10 border-b border-[var(--border-base)] bg-[var(--surface)]">
        <div className="app-rail flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[var(--accent)]">
              <BrandMark className="h-5 w-5" />
            </div>
            <p className="font-display text-sm font-semibold text-[var(--foreground)]">
              {step === "profile" ? "Welcome to AiTo" : `Welcome, ${firstName}`}
            </p>
          </div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
            {stepNum}
          </p>
        </div>
      </header>

      <main className="app-rail flex-1 px-4 py-6">
        {step === "profile" && (
          <section className="mx-auto w-full max-w-md">
            <h1 className="font-display text-2xl font-medium leading-snug text-[var(--foreground)]">
              Set up your profile.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              This is how people find and recognize you. Your email is never shown —
              instead you get a username you choose, not one built from your address.
            </p>

            <label className="mt-6 block">
              <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Display name</span>
              <input
                type="text"
                autoComplete="name"
                value={profileName}
                onChange={(e) => {
                  setProfileName(e.target.value);
                  setProfileError(null);
                }}
                required
                className="w-full rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-4 py-3 text-sm outline-none focus:border-[var(--accent)]"
                placeholder="Alex"
              />
            </label>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium text-[var(--muted)]">Username</span>
              <div className="flex items-center rounded-xl border border-[var(--border-base)] bg-[var(--surface)] focus-within:border-[var(--accent)]">
                <span className="pl-4 text-sm font-semibold text-[var(--muted)]">@</span>
                <input
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={profileUsername}
                  onChange={(e) => {
                    setProfileUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, ""));
                    setProfileError(null);
                    setSuggestions([]);
                  }}
                  placeholder="alex_writes"
                  required
                  className="w-full rounded-r-xl bg-transparent px-3 py-3 text-sm outline-none"
                />
              </div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                Letters, numbers, and underscores only — how people find you in search.
              </p>
            </label>

            {profileError && <p className="mt-2 text-xs leading-relaxed text-rose-700">{profileError}</p>}
            {suggestions.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-[var(--muted)]">Available:</span>
                {suggestions.map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => {
                      setProfileUsername(sug);
                      setProfileError(null);
                      setSuggestions([]);
                    }}
                    className="rounded-full border border-[var(--border-base)] bg-[var(--surface)] px-3 py-1 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]"
                  >
                    @{sug}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              disabled={profileBusy || !profileName.trim()}
              onClick={() => void saveProfile()}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] py-3.5 text-sm font-semibold text-[var(--surface)] transition hover:bg-[var(--accent-2)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UserRound className="h-4 w-4" strokeWidth={2} />
              {profileBusy ? "Saving…" : "Save & continue"}
            </button>
          </section>
        )}

        {step === "feeling" && (
          <section className="mx-auto w-full max-w-md">
            <h1 className="font-display text-2xl font-medium leading-snug text-[var(--foreground)]">
              Say how AI makes you feel right now.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              One tap. Not a debate, not a hot take — your honest feeling. It’s okay to feel
              bad about AI too.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {FEELINGS.map((f) => {
                const active = feeling === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFeeling(f.id)}
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-2)]"
                        : `${f.chip} hover:border-[var(--accent)]`
                    }`}
                  >
                    <span className="block text-sm font-semibold">{f.label}</span>
                    <span className="mt-0.5 block text-[11px] opacity-80">{f.short}</span>
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              disabled={!feeling}
              onClick={() => setStep("words")}
              className="mt-6 w-full rounded-full bg-[var(--accent)] py-3.5 text-sm font-semibold text-[var(--surface)] transition hover:bg-[var(--accent-2)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
            {!feeling && (
              <p className="mt-2 text-center text-[11px] text-[var(--muted)]">
                Pick the feeling that’s true for you
              </p>
            )}
            <button
              type="button"
              onClick={() => setStep("together")}
              className="mt-2 w-full rounded-full border border-[var(--border-base)] py-3.5 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-2)]"
            >
              Skip for now
            </button>
          </section>
        )}

        {step === "words" && (
          <section className="mx-auto w-full max-w-md">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--muted)]">You feel</span>
              {feeling && (
                <span className="rounded-full border border-[var(--border-base)] bg-[var(--surface-2)] px-2.5 py-0.5 text-xs font-semibold text-[var(--foreground)]">
                  {feelingOf(feeling)?.short}
                </span>
              )}
            </div>

            <h1 className="font-display mt-4 text-2xl font-medium leading-snug text-[var(--foreground)]">
              Say it in your own words.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              Today’s prompt: <span className="text-[var(--foreground)]">{dailyPrompt()}</span>
            </p>

            <textarea
              value={text}
              aria-label="Your answer to today’s prompt"
              onChange={(e) => {
                setText(e.target.value);
                setPublishError(null);
              }}
              rows={4}
              maxLength={360}
              autoFocus
              dir="auto"
              placeholder="No polish required. A sentence is enough."
              className="mt-5 w-full rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-4 py-3 text-sm leading-relaxed outline-none focus:border-[var(--accent)]"
            />

            {publishError && !shared && (
              <p className="mt-2 text-xs leading-relaxed text-rose-700">{publishError}</p>
            )}

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={publishing || shared}
                onClick={() => void submit()}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] py-3.5 text-sm font-semibold text-[var(--surface)] transition hover:bg-[var(--accent-2)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {shared ? (
                  <>
                    <Check className="h-4 w-4" strokeWidth={2.5} />
                    Shared
                  </>
                ) : publishing ? (
                  "Sharing…"
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Share my take
                  </>
                )}
              </button>
              <button
                type="button"
                disabled={publishing}
                onClick={() => setStep("together")}
                className="w-full rounded-full border border-[var(--border-base)] py-3.5 text-sm font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-2)] disabled:opacity-50"
              >
                Skip for now
              </button>
            </div>

            <p className="mt-4 text-center text-[11px] text-[var(--muted)]">
              Voice and video are here whenever you’re ready — words are a great start.
            </p>
          </section>
        )}

        {step === "together" && (
          <section className="mx-auto w-full max-w-md">
            <h1 className="font-display text-2xl font-medium leading-snug text-[var(--foreground)]">
              You’re not alone in this.
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              {shared
                ? "Your take is live in Voices. Feel with a few people who answered today’s prompt."
                : "Feel with a few people who answered today’s prompt — that’s how the circle grows."}
            </p>

            <div className="mt-4">
              <SharedSpectrum />
            </div>

            <div className="mt-5 space-y-2">
              {peersLoading && (
                <p className="text-center text-xs text-[var(--muted)]">Finding today’s voices…</p>
              )}
              {!peersLoading && peers.length === 0 && (
                <p className="rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-4 py-3 text-center text-xs leading-relaxed text-[var(--muted)]">
                  You might be the first voice today — that makes it yours. Browse Voices and
                  see who’s out there.
                </p>
              )}
              {peers.map((p) => {
                const done = felt.has(p.handle);
                return (
                  <div
                    key={p.handle}
                    className="flex items-start justify-between gap-3 rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                        {p.author}
                      </p>
                      <p className="truncate text-xs text-[var(--muted)]">{p.handle}</p>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--foreground)]">
                        {p.preview}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={done}
                      onClick={() => {
                        void (async () => {
                          await onFeelWith(p.handle);
                          setFelt((prev) => new Set(prev).add(p.handle));
                        })();
                      }}
                      className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition ${
                        done
                          ? "bg-[var(--accent-soft)] text-[var(--accent-2)]"
                          : "bg-[var(--accent)] text-[var(--surface)] hover:bg-[var(--accent-2)]"
                      }`}
                    >
                      {done ? "Feeling with" : "Feel with"}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-col gap-2">
              <button
                type="button"
                onClick={onDone}
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[var(--accent)] py-3.5 text-sm font-semibold text-[var(--surface)] transition hover:bg-[var(--accent-2)]"
              >
                <HeartHandshake className="h-4 w-4" />
                Start exploring
              </button>
              <p className="text-center text-[11px] text-[var(--muted)]">
                Anytime: pick a feeling again, or react to a take that moves you.
              </p>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}