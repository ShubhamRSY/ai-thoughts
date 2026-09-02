"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { PencilLine, Check, Settings2, Mail, KeyRound, LogOut } from "lucide-react";
import type { Thought } from "@/lib/types";
import FeelingBadge from "@/components/FeelingBadge";
import { useLocalProfile } from "@/hooks/useLocalProfile";
import {
  isLive,
  getSessionUser,
  getProfile,
  requestMagicLink,
  verifyOtp,
  signOut,
  saveProfile,
} from "@/lib/supabase/feed";

interface ProfileViewProps {
  myThoughts: Thought[];
  onCreate: () => void;
}

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

export default function ProfileView({ myThoughts, onCreate }: ProfileViewProps) {
  const { profile, save } = useLocalProfile();
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState(profile.handle || "");
  const [author, setAuthor] = useState(profile.author || "");

  // Live-mode auth (only active when Supabase is configured)
  const live = isLive();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    getSessionUser().then(async (u) => {
      if (cancelled) return;
      setUser(u);
      if (u) {
        const p = await getProfile(u.id);
        if (p && !cancelled) {
          if (p.handle && !profile.handle) save({ ...profile, handle: p.handle });
          if (p.author && !profile.author) save({ ...profile, author: p.author });
        }
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live]);

  const commit = async () => {
    const handleValue = handle.trim() ? (handle.trim().startsWith("@") ? handle.trim() : `@${handle.trim()}`) : "";
    const authorValue = author.trim();
    save({ handle: handleValue, author: authorValue });
    if (live && user) {
      const err = await saveProfile(user.id, handleValue || `@user_${user.id.slice(0, 6)}`, authorValue);
      if (err) setAuthMsg(err);
    }
    setEditing(false);
  };

  const sendCode = async () => {
    setBusy(true);
    setAuthMsg(null);
    const err = await requestMagicLink(email.trim());
    setBusy(false);
    if (err) setAuthMsg(err ?? "Something went wrong.");
    else setCodeSent(true);
  };

  const verifyCode = async () => {
    setBusy(true);
    setAuthMsg(null);
    const err = await verifyOtp(email.trim(), code.trim());
    setBusy(false);
    if (err) {
      setAuthMsg(err);
      return;
    }
    setCodeSent(false);
    setCode("");
    setUser((await getSessionUser()) ?? null);
  };

  const name = profile.author || profile.handle.replace(/^@/, "") || "You";
  const displayHandle = profile.handle || "@you";

  return (
    <div className="px-4 py-5">
      {/* Profile card */}
      <div className="rounded-2xl border border-zinc-800/80 bg-zinc-900/40 p-5">
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
              <h2 className="truncate text-lg font-bold text-zinc-100">{name}</h2>
              <button
                onClick={() => setEditing((v) => !v)}
                aria-label="Edit profile"
                className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                {editing ? <Check className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-sm text-zinc-500">{displayHandle}</p>
            <p className="mt-1 text-xs text-zinc-400">
              Every age has a voice. Every feeling belongs here. 💜
            </p>
          </div>
        </div>

        {editing && (
          <div className="mt-4 space-y-3 border-t border-zinc-800/80 pt-4">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Handle
              </label>
              <input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="@yourname"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/60 focus:outline-none"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                Display name
              </label>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/60 focus:outline-none"
              />
            </div>
            <button
              onClick={commit}
              className="w-full rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-500"
            >
              Save profile
            </button>
          </div>
        )}

        {/* Live-mode account / sign-in */}
        {live && user !== undefined && (
          <div className="mt-4 border-t border-zinc-800/80 pt-4">
            {user ? (
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                    <Check className="h-3.5 w-3.5" /> Signed in
                  </p>
                  <p className="truncate text-xs text-zinc-400">{user.email}</p>
                </div>
                <button
                  onClick={() => signOut().then(() => setUser(null))}
                  className="flex items-center gap-1 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-400 transition hover:border-zinc-700 hover:text-zinc-200"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </button>
              </div>
            ) : (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  Claim your handle (free, no password)
                </p>
                {!codeSent ? (
                  <div className="mt-2 flex gap-2">
                    <div className="relative flex-1">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@email.com"
                        inputMode="email"
                        autoComplete="email"
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 py-2 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-violet-500/60 focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={sendCode}
                      disabled={busy || email.trim().length < 5}
                      className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40"
                    >
                      {busy ? "Sending…" : "Send code"}
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex gap-2">
                    <div className="relative flex-1">
                      <KeyRound className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="6-digit code"
                        inputMode="numeric"
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-900/60 py-2 pl-9 pr-3 text-sm tracking-[0.3em] text-zinc-100 placeholder:tracking-normal placeholder:text-zinc-600 focus:border-violet-500/60 focus:outline-none"
                      />
                    </div>
                    <button
                      onClick={verifyCode}
                      disabled={busy || code.trim().length < 6}
                      className="shrink-0 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-500 disabled:opacity-40"
                    >
                      {busy ? "Verifying…" : "Verify"}
                    </button>
                  </div>
                )}
                {authMsg && <p className="mt-2 text-[11px] text-rose-400">{authMsg}</p>}
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="mt-4 flex gap-6 border-t border-zinc-800/80 pt-4 text-center">
          <div>
            <div className="text-lg font-bold text-zinc-100 tabular-nums">{myThoughts.length}</div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Takes</div>
          </div>
          <div>
            <div className="text-lg font-bold text-zinc-100 tabular-nums">
              {myThoughts.reduce((s, t) => s + (t.feeling ? 1 : 0), 0)}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">Feelings</div>
          </div>
        </div>
      </div>

      {/* My takes */}
      <div className="mt-6">
        <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          <Settings2 className="h-3.5 w-3.5" />
          Your takes
        </div>
        {myThoughts.length === 0 ? (
          <button
            onClick={onCreate}
            className="w-full rounded-2xl border border-dashed border-zinc-800 bg-zinc-900/30 px-4 py-8 text-center transition hover:border-zinc-700"
          >
            <span className="text-2xl">🎙️</span>
            <p className="mt-1 text-sm font-medium text-zinc-300">Share your first take</p>
            <p className="mt-0.5 text-xs text-zinc-500">How do you really feel about AI right now?</p>
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {myThoughts.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-3 py-2.5"
              >
                <FeelingBadge feeling={t.feeling} />
                <p className="min-w-0 flex-1 truncate text-sm text-zinc-200">{t.content}</p>
                <span className="shrink-0 text-xs text-zinc-500 tabular-nums">{t.timeLabel}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}