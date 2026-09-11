"use client";

import { useState } from "react";
import { PencilLine, Check, Settings2 } from "lucide-react";
import type { Thought } from "@/lib/types";
import FeelingBadge from "@/components/FeelingBadge";
import { useLocalProfile } from "@/hooks/useLocalProfile";
import { useAuth } from "@/hooks/useAuth";
import { saveProfile } from "@/lib/db";

interface ProfileViewProps {
  myThoughts: Thought[];
  onCreate: () => void;
}

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

export default function ProfileView({ myThoughts, onCreate }: ProfileViewProps) {
  const { profile, save } = useLocalProfile();
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState(profile.handle || "");
  const [author, setAuthor] = useState(profile.author || "");
  const [saved, setSaved] = useState(false);

  const commit = async () => {
    const handleValue = handle.trim() ? (handle.trim().startsWith("@") ? handle.trim() : `@${handle.trim()}`) : "";
    const authorValue = author.trim();
    save({ handle: handleValue, author: authorValue });
    await saveProfile("local", handleValue || "@you", authorValue);
    setEditing(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const name = user?.displayName || profile.author || profile.handle.replace(/^@/, "") || "You";
  const displayHandle = user?.handle || profile.handle || "@you";

  return (
    <div className="px-4 py-5">
      {/* Profile card */}
      <div className="rounded-2xl border border-[var(--border-base)] bg-white p-5 shadow-sm shadow-slate-900/5">
        <div className="flex items-center gap-4">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${avatarGradient(
              displayHandle
            )} text-lg font-bold text-white`}
          >
            {initials(name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-display truncate text-lg font-bold text-[var(--foreground)]">{name}</h2>
              {!user && (
                <button
                  onClick={() => setEditing((v) => !v)}
                  aria-label="Edit profile"
                  className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                >
                  {editing ? <Check className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
                </button>
              )}
            </div>
            <p className="text-sm text-[var(--muted)]">{displayHandle}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              Every age has a voice. Every feeling belongs here.
            </p>
          </div>
        </div>

        {editing && (
          <div className="mt-4 space-y-3 border-t border-[var(--border-base)] pt-4">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Handle
              </label>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@yourname"
                className="w-full rounded-lg border border-[var(--border-base)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Display name
              </label>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-lg border border-[var(--border-base)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted)]/60 focus:border-[var(--accent)] focus:outline-none"
              />
            </div>
            <button
              onClick={commit}
              className="w-full rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-2)]"
            >
              Save profile
            </button>
          </div>
        )}

        {saved && (
          <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <Check className="h-3.5 w-3.5" /> Profile saved
          </p>
        )}

        {/* Stats */}
        <div className="mt-4 flex gap-6 border-t border-[var(--border-base)] pt-4 text-center">
          <div>
            <div className="text-lg font-bold text-[var(--foreground)] tabular-nums">{myThoughts.length}</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">Takes</div>
          </div>
          <div>
            <div className="text-lg font-bold text-[var(--foreground)] tabular-nums">
              {myThoughts.reduce((s, t) => s + (t.feeling ? 1 : 0), 0)}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">Feelings</div>
          </div>
        </div>
      </div>

      {/* My takes */}
      <div className="mt-6">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          <Settings2 className="h-3.5 w-3.5" />
          Your takes
        </div>
        {myThoughts.length === 0 ? (
          <button
            onClick={onCreate}
            className="w-full rounded-2xl border border-dashed border-[var(--border-base)] bg-[var(--surface)] px-4 py-8 text-center transition hover:border-teal-200"
          >
            <span className="text-2xl text-[var(--accent)]" aria-hidden>◎</span>
            <p className="mt-1 text-sm font-medium text-[var(--foreground)]">Share your first take</p>
            <p className="mt-0.5 text-xs text-[var(--muted)]">How do you really feel about AI right now?</p>
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {myThoughts.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border-base)] bg-white px-3 py-2.5 shadow-sm shadow-slate-900/5"
              >
                <FeelingBadge feeling={t.feeling} />
                <p dir="auto" className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]">{t.content}</p>
                <span className="shrink-0 text-xs text-[var(--muted)] tabular-nums">{t.timeLabel}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
