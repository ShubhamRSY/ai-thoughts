"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, Check, Download, PencilLine, Trash2 } from "lucide-react";
import { upload } from "@vercel/blob/client";
import type { Thought } from "@/lib/types";
import { useLocalProfile } from "@/hooks/useLocalProfile";
import { useAuth } from "@/hooks/useAuth";
import { saveProfile } from "@/lib/db";
import { BRAND } from "@/lib/brand";

interface ProfileViewProps {
  myThoughts: Thought[];
  onCreate: () => void;
  onDelete?: (thoughtId: string) => void;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

export default function ProfileView({ myThoughts, onCreate, onDelete }: ProfileViewProps) {
  const router = useRouter();
  const { profile, save } = useLocalProfile();
  const { user, signOut, refresh } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [handle, setHandle] = useState(profile.handle || "");
  const [author, setAuthor] = useState(profile.author || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatarUrl || "");
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const name = user?.displayName || profile.author || profile.handle.replace(/^@/, "") || "You";
  const displayHandle = user?.handle || profile.handle || "@you";
  const tagCount = new Set(myThoughts.flatMap((t) => t.tags ?? [])).size;

  const persist = async (next: {
    handle?: string;
    author?: string;
    bio?: string;
    avatarUrl?: string;
  }) => {
    const handleValue = (next.handle ?? handle).trim()
      ? ((next.handle ?? handle).trim().startsWith("@")
          ? (next.handle ?? handle).trim()
          : `@${(next.handle ?? handle).trim()}`)
      : displayHandle;
    const authorValue = (next.author ?? author).trim() || name;
    const bioValue = (next.bio ?? bio).trim().slice(0, 160);
    const avatarValue = next.avatarUrl ?? avatarUrl;
    const payload = {
      handle: handleValue,
      author: authorValue,
      bio: bioValue,
      avatarUrl: avatarValue,
    };
    save(payload);
    setHandle(handleValue);
    setAuthor(authorValue);
    setBio(bioValue);
    setAvatarUrl(avatarValue);
    await saveProfile(user?.id || "local", handleValue, authorValue, {
      bio: bioValue,
      avatarUrl: avatarValue,
    }).then((err) => {
      if (err) throw new Error(err.replace(/^Error:\s*/, "") || "Couldn’t save profile.");
    });
  };

  const commit = async () => {
    setError(null);
    try {
      await persist({});
      await refresh();
      setEditing(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t save profile.");
    }
  };

  const onPickAvatar = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      setError("Keep the photo under 4MB.");
      return;
    }
    if (!user) {
      setError("Sign in to upload a profile photo.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const ext = file.type.includes("png")
        ? "png"
        : file.type.includes("webp")
          ? "webp"
          : "jpg";
      const uploaded = await upload(`avatar-${Date.now()}.${ext}`, file, {
        access: "public",
        contentType: file.type,
        handleUploadUrl: "/api/upload",
      });
      await persist({ avatarUrl: uploaded.url });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch {
      setError("Couldn’t upload that photo. Try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="py-5">
      <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-5">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-lg font-semibold text-[var(--surface)]">
                {initials(name)}
              </div>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Add profile photo"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-base)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm transition hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => void onPickAvatar(e.target.files?.[0] ?? null)}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-display truncate text-lg font-semibold text-[var(--foreground)]">
                {name}
              </h2>
              <button
                type="button"
                onClick={() => (editing ? void commit() : setEditing(true))}
                aria-label={editing ? "Save profile" : "Edit profile"}
                className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
              >
                {editing ? <Check className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-sm text-[var(--muted)]">{displayHandle}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground)]">
              {(bio || profile.bio || BRAND.footerLine).trim()}
            </p>
          </div>
        </div>

        {editing && (
          <div className="mt-4 space-y-3 border-t border-[var(--border-base)] pt-4">
            {!user && (
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                  Handle
                </label>
                <input
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="@yourname"
                  className="w-full rounded-lg border border-[var(--border-base)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
                />
              </div>
            )}
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Display name
              </label>
              <input
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-lg border border-[var(--border-base)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">
                Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 160))}
                rows={2}
                placeholder="A line about you and AI…"
                className="w-full resize-none rounded-lg border border-[var(--border-base)] bg-[var(--surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
              />
            </div>
            <button
              type="button"
              onClick={() => void commit()}
              className="w-full rounded-full bg-[var(--accent)] py-2.5 text-sm font-semibold text-[var(--surface)] hover:bg-[var(--accent-2)]"
            >
              Save profile
            </button>
          </div>
        )}

        {(saved || uploading || error) && (
          <p
            className={`mt-3 text-xs font-medium ${
              error ? "text-rose-700" : "text-[var(--accent)]"
            }`}
          >
            {error ?? (uploading ? "Uploading photo…" : "Profile saved")}
          </p>
        )}

        <div className="mt-5 grid grid-cols-3 gap-3 border-t border-[var(--border-base)] pt-4 text-center">
          <div>
            <div className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
              {myThoughts.length}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
              Takes
            </div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
              {tagCount}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
              Topics
            </div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
              {myThoughts.filter((t) => t.mediaType !== "text").length}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
              Clips
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          <Download className="h-3.5 w-3.5 text-[var(--accent)]" /> Get the app
        </p>
        <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
          Install {BRAND.shortName} on your phone home screen, or download for Windows.
        </p>
        <Link
          href="/install"
          className="mt-3 inline-flex rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--surface)] transition hover:bg-[var(--accent-2)]"
        >
          Install {BRAND.shortName}
        </Link>
      </div>

      {user && (
        <div className="mt-6">
          <div className="rounded-2xl border border-rose-200/80 bg-rose-50/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-800/80">
            Delete account
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
            Permanently removes your profile, takes, replies, reactions, follows, push
            subscriptions, and digest settings. This cannot be undone.
          </p>
          <button
            type="button"
            disabled={deletingAccount}
            onClick={() => {
              if (
                !window.confirm(
                  "Delete your account and all your takes forever? Type OK on the next prompt."
                )
              ) {
                return;
              }
              const typed = window.prompt('Type DELETE to confirm account wipe:');
              if (typed !== "DELETE") return;
              void (async () => {
                setDeletingAccount(true);
                setError(null);
                try {
                  const res = await fetch("/api/account", {
                    method: "DELETE",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ confirm: "DELETE" }),
                  });
                  const data = await res.json().catch(() => ({}));
                  if (!res.ok) {
                    setError(
                      typeof data.error === "string"
                        ? data.error
                        : "Couldn’t delete account"
                    );
                    return;
                  }
                  await signOut();
                  router.replace("/");
                } catch {
                  setError("Couldn’t delete account. Try again.");
                } finally {
                  setDeletingAccount(false);
                }
              })();
            }}
            className="mt-3 w-full rounded-full border border-rose-300 bg-white py-2.5 text-sm font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
          >
            {deletingAccount ? "Deleting…" : "Delete my account"}
          </button>
          </div>
        </div>
      )}

      <div className="mt-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          Your takes
        </p>
        {myThoughts.length === 0 ? (
          <button
            type="button"
            onClick={onCreate}
            className="w-full rounded-2xl border border-dashed border-[var(--border-base)] bg-[var(--surface)] px-4 py-8 text-center transition hover:border-[var(--accent)]"
          >
            <p className="text-sm font-medium text-[var(--foreground)]">Share your first take</p>
            <p className="mt-1 text-xs text-[var(--muted)]">{BRAND.tagline}</p>
          </button>
        ) : (
          <div className="flex flex-col gap-2">
            {myThoughts.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-3 py-2.5"
              >
                <p dir="auto" className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]">
                  {t.content}
                </p>
                <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">{t.timeLabel}</span>
                {onDelete && (
                  <button
                    type="button"
                    aria-label="Delete take"
                    onClick={() => {
                      if (
                        !window.confirm("Delete this take? It will be removed for everyone.")
                      ) {
                        return;
                      }
                      onDelete(t.id);
                    }}
                    className="shrink-0 rounded-md p-1.5 text-[var(--muted)] hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
