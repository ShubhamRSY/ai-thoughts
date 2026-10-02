"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Ban, Bookmark, Camera, Check, Download, Flag, Lock, PencilLine, Settings, UserPlus, UserCheck, BellOff, Send } from "lucide-react";
import ReportDialog from "@/components/ReportDialog";
import { upload } from "@vercel/blob/client";
import { stripImageMetadata } from "@/lib/image";
import type { Thought } from "@/lib/types";
import { useLocalProfile } from "@/hooks/useLocalProfile";
import { useAuth } from "@/hooks/useAuth";
import {
  saveProfile,
  fetchProfileInfo,
  fetchPostsByHandle,
  fetchPostsTagged,
  fetchFollowGraph,
  reportAccount,
  type ProfileInfo,
  type FollowGraph,
} from "@/lib/db";
import VerifiedBadge from "@/components/VerifiedBadge";
import { BRAND } from "@/lib/brand";
import WindowsStoreCta, { isWindowsBrowser } from "@/components/WindowsStoreCta";

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

interface ProfileViewProps {
  myThoughts: Thought[];
  /** Bookmarked takes — private to this viewer, never shown to anyone else. */
  savedThoughts?: Thought[];
  /** Takes you've reposted/quote-reposted — own profile only. */
  repostedThoughts?: Thought[];
  onCreate: () => void;
  /** Renders the profile's takes as full feed cards (the page owns their actions). */
  renderPosts: (posts: Thought[]) => ReactNode;
  onUnsave?: (thoughtId: string) => void;
  /** Handle to view. Omitted/own handle = your own editable profile. */
  viewHandle?: string;
  /** Follow/unfollow the profile being viewed (only used when viewHandle is someone else). */
  onFollowToggle?: (handle: string, next: boolean) => void | Promise<unknown>;
  /** Shown as a "← Back" affordance when viewing someone else's profile. */
  onBack?: () => void;
  /** Opens the Account Center (owned by the page so it can replace the whole view). */
  onOpenAccount?: () => void;
  /** Start / open a direct message with the profile being viewed. */
  onMessage?: (person: { handle: string; displayName: string }) => void;
}

interface ConnectionProfile {
  handle: string;
  author: string;
  avatarUrl: string;
}

function initials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

export default function ProfileView({
  myThoughts,
  savedThoughts = [],
  repostedThoughts = [],
  onCreate,
  renderPosts,
  onUnsave,
  viewHandle,
  onFollowToggle,
  onBack,
  onOpenAccount,
  onMessage,
}: ProfileViewProps) {
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
  // Read after mount so server and client render the same markup.
  const [onWindows, setOnWindows] = useState(false);
  useEffect(() => setOnWindows(isWindowsBrowser()), []);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [followers, setFollowers] = useState<ConnectionProfile[]>([]);
  const [followingList, setFollowingList] = useState<ConnectionProfile[]>([]);

  // The browser's saved profile isn't tied to an account: only trust it when it
  // belongs to whoever is signed in, then load the real bio/avatar from the server.
  const userHandle = user?.handle;
  const userName = user?.displayName;
  useEffect(() => {
    if (!userHandle) return;
    const mine = normHandle(profile.handle || "") === normHandle(userHandle);
    setHandle(userHandle);
    setAuthor(userName || "");
    setBio(mine ? profile.bio || "" : "");
    setAvatarUrl(mine ? profile.avatarUrl || "" : "");
    let cancelled = false;
    fetchProfileInfo(userHandle).then((p) => {
      if (cancelled || !p) return;
      const next = { handle: userHandle, author: userName || "", bio: p.bio || "", avatarUrl: p.avatarUrl || "" };
      setBio(next.bio);
      setAvatarUrl(next.avatarUrl);
      save(next);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-sync only when the account changes
  }, [userHandle, userName]);

  const isOwn = !viewHandle || (user ? normHandle(viewHandle) === normHandle(user.handle) : false);
  const effectiveHandle = isOwn ? user?.handle : viewHandle;

  // Someone else's profile: their bio/avatar, their takes, their follow graph.
  const [viewedProfile, setViewedProfile] = useState<ProfileInfo | null>(null);
  const [viewedPosts, setViewedPosts] = useState<Thought[]>([]);
  const [viewedFollow, setViewedFollow] = useState<FollowGraph | null>(null);
  const [followBusy, setFollowBusy] = useState(false);
  const [taggedThoughts, setTaggedThoughts] = useState<Thought[]>([]);

  useEffect(() => {
    if (isOwn || !viewHandle) {
      setViewedProfile(null);
      setViewedPosts([]);
      setViewedFollow(null);
      return;
    }
    let cancelled = false;
    Promise.all([
      fetchProfileInfo(viewHandle),
      fetchPostsByHandle(viewHandle),
      fetchFollowGraph(viewHandle),
    ]).then(([p, posts, graph]) => {
      if (cancelled) return;
      setViewedProfile(p);
      setViewedPosts(posts);
      setViewedFollow(graph);
    });
    return () => {
      cancelled = true;
    };
  }, [isOwn, viewHandle]);

  // "Tagged" applies to whichever profile is showing — own or someone else's.
  useEffect(() => {
    if (!effectiveHandle) {
      setTaggedThoughts([]);
      return;
    }
    let cancelled = false;
    fetchPostsTagged(effectiveHandle).then((rows) => {
      if (!cancelled) setTaggedThoughts(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [effectiveHandle]);

  const name = isOwn
    ? user?.displayName || profile.author || profile.handle.replace(/^@/, "") || "You"
    : viewedProfile?.author || viewHandle?.replace(/^@/, "") || "";
  const displayHandle = isOwn ? user?.handle || profile.handle || "@you" : viewHandle || "";
  const verified = isOwn ? Boolean(user?.verified) : Boolean(viewedProfile?.verified);
  const postsList = isOwn ? myThoughts : viewedPosts;

  useEffect(() => {
    if (!isOwn || !user) {
      setFollowers([]);
      setFollowingList([]);
      return;
    }
    let cancelled = false;
    fetch("/api/follows", { credentials: "include", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        setFollowers(data.followers ?? []);
        setFollowingList(data.followingProfiles ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOwn, user]);

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
      const clean = await stripImageMetadata(file);
      const uploaded = await upload(`avatar-${crypto.randomUUID()}.${ext}`, clean, {
        access: "public",
        contentType: clean.type,
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

  const followState =
    viewedFollow?.followState ?? (viewedFollow?.isFollowedByMe ? "following" : "none");
  const isFollowingViewed = followState === "following";
  const isRequested = followState === "requested";

  const toggleFollow = async () => {
    if (!viewHandle || !onFollowToggle || followBusy) return;
    setFollowBusy(true);
    const next = !(isFollowingViewed || isRequested); // tapping "Requested" cancels it
    try {
      await onFollowToggle(viewHandle, next);
      const graph = await fetchFollowGraph(viewHandle);
      setViewedFollow(graph);
    } finally {
      setFollowBusy(false);
    }
  };

  const setBlocked = async (action: "block" | "unblock") => {
    if (!viewHandle || followBusy) return;
    if (
      action === "block" &&
      !window.confirm(
        `Block ${viewHandle}? Neither of you will see the other's takes or profile, and they won't be told.`
      )
    ) {
      return;
    }
    setFollowBusy(true);
    try {
      const res = await fetch("/api/blocks", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: viewHandle, action }),
      });
      if (!res.ok) return;
      if (action === "block") onBack?.();
      else setViewedFollow(await fetchFollowGraph(viewHandle));
    } finally {
      setFollowBusy(false);
    }
  };

  const [reportingAccount, setReportingAccount] = useState(false);

  const setMuted = async (action: "mute" | "unmute") => {
    if (!viewHandle || followBusy) return;
    setFollowBusy(true);
    try {
      const res = await fetch("/api/mutes", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ handle: viewHandle, action }),
      });
      if (!res.ok) return;
      // Unmuting keeps their public takes in view; the follow graph is the
      // single source the mute flag rides along on.
      setViewedFollow(await fetchFollowGraph(viewHandle));
    } finally {
      setFollowBusy(false);
    }
  };

  const shownAvatarUrl = isOwn ? avatarUrl : viewedProfile?.avatarUrl || "";
  const shownBio = isOwn
    ? (bio || "No bio yet.").trim()
    : (viewedProfile?.bio || "No bio yet.").trim();


  return (
    <div className="py-5">
      {reportingAccount && viewHandle && (
        <ReportDialog
          subject="account"
          signedIn={Boolean(user)}
          onSubmit={(reason) => reportAccount(viewHandle, reason)}
          onClose={() => setReportingAccount(false)}
        />
      )}
      {!isOwn && onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      )}
      <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-5">
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            {shownAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={shownAvatarUrl}
                alt=""
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--accent)] text-lg font-semibold text-[var(--surface)]">
                {initials(name)}
              </div>
            )}
            {isOwn && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              aria-label="Add profile photo"
              className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--border-base)] bg-[var(--surface)] text-[var(--foreground)] shadow-sm transition hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              <Camera className="h-3.5 w-3.5" />
            </button>
            )}
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
              {verified && (
                <span className="shrink-0 text-sky-500">
                  <VerifiedBadge className="h-5 w-5" />
                </span>
              )}
              {isOwn ? (
                <button
                  type="button"
                  onClick={() => (editing ? void commit() : setEditing(true))}
                  aria-label={editing ? "Save profile" : "Edit profile"}
                  className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                >
                  {editing ? <Check className="h-4 w-4" /> : <PencilLine className="h-4 w-4" />}
                </button>
              ) : user && viewedFollow?.blockedByMe ? (
                <button
                  type="button"
                  onClick={() => void setBlocked("unblock")}
                  disabled={followBusy}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-base)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] disabled:opacity-50"
                >
                  <Ban className="h-3.5 w-3.5" /> Unblock
                </button>
              ) : (
                user && onFollowToggle && (
                  <>
                  <button
                    type="button"
                    aria-label={viewedFollow?.mutedByMe ? "Unmute" : "Mute"}
                    title={viewedFollow?.mutedByMe ? "Unmute — see their takes again" : "Mute — hide their takes from your feed"}
                    onClick={() => void (viewedFollow?.mutedByMe ? setMuted("unmute") : setMuted("mute"))}
                    disabled={followBusy}
                    className={`rounded-lg p-1.5 transition disabled:opacity-50 ${
                      viewedFollow?.mutedByMe
                        ? "text-[var(--accent)] hover:bg-[var(--surface-2)]"
                        : "text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    <BellOff className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Report account"
                    title="Report this account"
                    onClick={() => setReportingAccount(true)}
                    className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-rose-700"
                  >
                    <Flag className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Block"
                    onClick={() => void setBlocked("block")}
                    disabled={followBusy}
                    className="rounded-lg p-1.5 text-[var(--muted)] transition hover:bg-[var(--surface-2)] hover:text-rose-700 disabled:opacity-50"
                  >
                    <Ban className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void toggleFollow()}
                    disabled={followBusy}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                      isFollowingViewed || isRequested
                        ? "border border-[var(--border-base)] text-[var(--foreground)] hover:border-rose-300 hover:text-rose-700"
                        : "bg-[var(--accent)] text-[var(--surface)] hover:bg-[var(--accent-2)]"
                    }`}
                  >
                    {isFollowingViewed ? (
                      <>
                        <UserCheck className="h-3.5 w-3.5" /> Following
                      </>
                    ) : isRequested ? (
                      <>
                        <UserCheck className="h-3.5 w-3.5" /> Requested
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-3.5 w-3.5" /> Follow
                      </>
                    )}
                  </button>
                  {onMessage && viewHandle && (
                    <button
                      type="button"
                      onClick={() => onMessage({ handle: viewHandle, displayName: name })}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-base)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]"
                    >
                      <Send className="h-3.5 w-3.5" /> Message
                    </button>
                  )}
                  </>
                )
              )}
            </div>
            <p className="text-sm text-[var(--muted)]">{displayHandle}</p>
            <p className="mt-2 text-sm leading-relaxed text-[var(--foreground)]">{shownBio}</p>
          </div>
        </div>

        {isOwn && editing && (
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
              {postsList.length}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
              Posts
            </div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
              {isOwn ? followers.length : (viewedFollow?.followers.length ?? 0)}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
              Followers
            </div>
          </div>
          <div>
            <div className="text-lg font-semibold tabular-nums text-[var(--foreground)]">
              {isOwn ? followingList.length : (viewedFollow?.followingProfiles.length ?? 0)}
            </div>
            <div className="text-[10px] font-medium uppercase tracking-wider text-[var(--muted)]">
              Following
            </div>
          </div>
        </div>
      </div>

      {isOwn
        ? user &&
          (followers.length > 0 || followingList.length > 0) && (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ConnectionList title="Followers" people={followers} />
              <ConnectionList title="Following" people={followingList} />
            </div>
          )
        : viewedFollow &&
          (viewedFollow.followers.length > 0 || viewedFollow.followingProfiles.length > 0) && (
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ConnectionList title="Followers" people={viewedFollow.followers} />
              <ConnectionList title="Following" people={viewedFollow.followingProfiles} />
            </div>
          )}

      {!isOwn && viewedFollow?.blockedByMe && (
        <div className="mt-6 rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-6 text-center">
          <Ban className="mx-auto h-5 w-5 text-[var(--muted)]" />
          <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">
            You blocked this account
          </p>
        </div>
      )}

      {!isOwn && viewedFollow?.restricted && !viewedFollow.blockedByMe && (
        <div className="mt-6 rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-6 text-center">
          <Lock className="mx-auto h-5 w-5 text-[var(--muted)]" />
          <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">
            This account is private
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            Follow to request access to their takes.
          </p>
        </div>
      )}

      <div className="mt-6">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
          {isOwn ? "Your takes" : "Posts"}
        </p>
        {postsList.length === 0 ? (
          isOwn ? (
            <button
              type="button"
              onClick={onCreate}
              className="w-full rounded-2xl border border-dashed border-[var(--border-base)] bg-[var(--surface)] px-4 py-8 text-center transition hover:border-[var(--accent)]"
            >
              <p className="text-sm font-medium text-[var(--foreground)]">Share your first take</p>
              <p className="mt-1 text-xs text-[var(--muted)]">{BRAND.tagline}</p>
            </button>
          ) : (
            <p className="rounded-2xl border border-dashed border-[var(--border-base)] bg-[var(--surface)] px-4 py-8 text-center text-sm text-[var(--muted)]">
              No takes yet.
            </p>
          )
        ) : (
          renderPosts(postsList)
        )}
      </div>

      {isOwn && user && onOpenAccount && (
        <button
          type="button"
          onClick={onOpenAccount}
          className="mt-6 flex w-full items-center justify-between rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--accent)]"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-[var(--foreground)]">
            <Settings className="h-4 w-4 text-[var(--accent)]" /> Account Center
          </span>
          <span className="text-xs text-[var(--muted)]">Privacy and requests</span>
        </button>
      )}

      {isOwn && (
        <div className="mt-6 rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            <Download className="h-3.5 w-3.5 text-[var(--accent)]" /> Get the app
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
            Install {BRAND.shortName} on your phone{onWindows ? " or this Windows PC" : ""}.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/install"
              className="inline-flex rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-[var(--surface)] transition hover:bg-[var(--accent-2)]"
            >
              Install {BRAND.shortName}
            </Link>
            {onWindows && (
              <WindowsStoreCta
                className="contents"
                showNote={false}
                buttonClassName="inline-flex rounded-full border border-[var(--border-base)] px-4 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:bg-[var(--surface-2)]"
              />
            )}
          </div>
        </div>
      )}

      {isOwn && user && (
        <div className="mt-6 space-y-3">
          <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              Your privacy
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              Download a copy of your data, or read how we protect email, media, and deletes.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={exporting}
                onClick={() => {
                  void (async () => {
                    setExporting(true);
                    setError(null);
                    try {
                      const res = await fetch("/api/account", { credentials: "include" });
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        setError(
                          typeof data.error === "string"
                            ? data.error
                            : "Couldn’t download your data"
                        );
                        return;
                      }
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `aito-data-${Date.now()}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    } catch {
                      setError("Couldn’t download your data. Try again.");
                    } finally {
                      setExporting(false);
                    }
                  })();
                }}
                className="rounded-full border border-[var(--border-base)] bg-white px-4 py-2 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)] disabled:opacity-50"
              >
                {exporting ? "Preparing…" : "Download my data"}
              </button>
              <Link
                href="/privacy"
                className="rounded-full border border-[var(--border-base)] px-4 py-2 text-xs font-semibold text-[var(--muted)] transition hover:text-[var(--foreground)]"
              >
                Privacy Policy
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-rose-200/80 bg-rose-50/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-800/80">
            Delete account
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
            Permanently removes your profile, takes, media files, replies, likes, follows, push
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

      {taggedThoughts.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Tagged
          </p>
          <div className="flex flex-col gap-2">
            {taggedThoughts.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-3 py-2.5"
              >
                <p dir="auto" className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]">
                  <span className="font-medium text-[var(--foreground)]">{t.author}: </span>
                  {t.content}
                </p>
                <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">{t.timeLabel}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isOwn && savedThoughts.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Saved
          </p>
          <div className="flex flex-col gap-2">
            {savedThoughts.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-3 py-2.5"
              >
                <p dir="auto" className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]">
                  {t.content}
                </p>
                <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">{t.timeLabel}</span>
                {onUnsave && (
                  <button
                    type="button"
                    aria-label="Remove bookmark"
                    onClick={() => onUnsave(t.id)}
                    className="shrink-0 rounded-md p-1.5 text-[var(--accent)] hover:bg-[var(--surface-2)]"
                  >
                    <Bookmark className="h-3.5 w-3.5" fill="currentColor" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isOwn && repostedThoughts.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
            Reposts
          </p>
          <div className="flex flex-col gap-2">
            {repostedThoughts.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 rounded-xl border border-[var(--border-base)] bg-[var(--surface)] px-3 py-2.5"
              >
                <p dir="auto" className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]">
                  <span className="font-medium text-[var(--foreground)]">{t.author}: </span>
                  {t.content}
                </p>
                <span className="shrink-0 text-xs tabular-nums text-[var(--muted)]">{t.timeLabel}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ConnectionList({ title, people }: { title: string; people: ConnectionProfile[] }) {
  return (
    <div className="rounded-2xl border border-[var(--border-base)] bg-[var(--surface)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
        {title} ({people.length})
      </p>
      {people.length === 0 ? (
        <p className="mt-2 text-xs text-[var(--muted)]">Nobody yet.</p>
      ) : (
        <div className="mt-2 flex flex-col gap-2">
          {people.map((p) => (
            <div key={p.handle} className="flex items-center gap-2.5">
              {p.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={p.avatarUrl}
                  alt=""
                  className="h-7 w-7 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[10px] font-semibold text-[var(--surface)]">
                  {initials(p.author)}
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[var(--foreground)]">{p.author}</p>
                <p className="truncate text-xs text-[var(--muted)]">{p.handle}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
