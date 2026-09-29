import { upload } from "@vercel/blob/client";
import { stripImageMetadata } from "@/lib/image";
import type { Thought, PublishResult } from "@/lib/types";
type PublishInput = Omit<Thought, "id" | "reactions" | "timeLabel">;

const API = "/api";

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = body as { error?: string; code?: string; retry_in_sec?: number };
    const message = err.error ?? `Request failed (${res.status})`;
    const e = new Error(message) as Error & { code?: string; retryInSec?: number; status?: number };
    e.code = err.code;
    e.retryInSec = err.retry_in_sec;
    e.status = res.status;
    throw e;
  }
  return (await res.json()) as T;
}

export function isLive(): boolean {
  return true;
}

export interface ChatMessage {
  id: string;
  post_id: string;
  handle: string;
  author: string;
  /** Blue verified checkmark on the commenter's account. */
  authorVerified?: boolean;
  body: string;
  created_at: string;
}

// Abstractions kept identical to the old backend layer so components
// don't change. MongoDB-backed API routes do the heavy lifting server-side.

interface RawPost {
  id: string;
  handle: string;
  author: string;
  author_verified?: boolean | null;
  content: string;
  media_type: "audio" | "video" | "text";
  feeling?: string | null;
  custom_feeling?: string | null;
  media_url?: string | null;
  media_duration?: string | null;
  stream_url?: string | null;
  stream_ready?: boolean | null;
  tags?: string[];
  language?: string | null;
  language_label?: string | null;
  integrity_hash?: string | null;
  integrity_verified?: boolean | null;
  integrity_label?: string | null;
  transcript?: unknown;
  prompt_day?: string | null;
  prompt_text?: string | null;
  created_at: string;
  reactions?: { type: string; count: number }[];
  liked_by?: { handle: string; author: string }[];
  like_count?: number;
  liked_by_me?: boolean;
  reply_count?: number;
  boost_count?: number;
  boosted_by_me?: boolean;
  bookmarked_by_me?: boolean;
  view_count?: number;
  author_joined_at?: string | null;
  quoted_post_id?: string | null;
  quoted_post?: {
    id: string;
    handle: string;
    author: string;
    author_verified?: boolean | null;
    content: string;
    media_type: string;
    media_url?: string | null;
    feeling?: string | null;
  } | null;
}

function toThought(r: RawPost): Thought {
  return {
    id: r.id,
    author: r.author || r.handle.replace(/^@/, ""),
    handle: r.handle,
    authorVerified: Boolean(r.author_verified),
    content: r.content,
    mediaType: r.media_type,
    feeling: (r.feeling as Thought["feeling"]) || undefined,
    customFeeling: r.custom_feeling ?? undefined,
    mediaUrl: r.media_url ?? undefined,
    mediaDuration: r.media_duration ?? undefined,
    streamUrl: r.stream_url ?? undefined,
    streamReady: Boolean(r.stream_ready),
    tags: Array.isArray(r.tags) ? r.tags : [],
    timestamp: r.created_at,
    timeLabel: timeLabelFor(r.created_at),
    language: r.language ?? undefined,
    languageLabel: r.language_label ?? undefined,
    promptDay: r.prompt_day ?? undefined,
    promptText: r.prompt_text ?? undefined,
    integrity: {
      hash: r.integrity_hash ?? "—",
      verified: Boolean(r.integrity_verified),
      statusLabel: r.integrity_label ?? "Signed on post",
    },
    transcript: Array.isArray(r.transcript)
      ? (r.transcript as Thought["transcript"])
      : undefined,
    reactions: (r.reactions ?? []).map((e) => ({
      type: e.type as Thought["reactions"][number]["type"],
      count: e.count,
    })),
    likedBy: Array.isArray(r.liked_by) ? r.liked_by : undefined,
    likeCount: typeof r.like_count === "number" ? r.like_count : undefined,
    likedByMe: Boolean(r.liked_by_me),
    replyCount: typeof r.reply_count === "number" ? r.reply_count : undefined,
    boostCount: typeof r.boost_count === "number" ? r.boost_count : undefined,
    boostedByMe: Boolean(r.boosted_by_me),
    bookmarkedByMe: Boolean(r.bookmarked_by_me),
    viewCount: typeof r.view_count === "number" ? r.view_count : undefined,
    authorJoinedAt: r.author_joined_at ?? undefined,
    quotedPostId: r.quoted_post_id ?? undefined,
    quotedPost: r.quoted_post
      ? {
          id: r.quoted_post.id,
          handle: r.quoted_post.handle,
          author: r.quoted_post.author || r.quoted_post.handle.replace(/^@/, ""),
          authorVerified: Boolean(r.quoted_post.author_verified),
          content: r.quoted_post.content,
          mediaType: r.quoted_post.media_type as Thought["mediaType"],
          mediaUrl: r.quoted_post.media_url ?? undefined,
          feeling: (r.quoted_post.feeling as Thought["feeling"]) || undefined,
        }
      : r.quoted_post_id
        ? null
        : undefined,
  };
}

export async function fetchPulsePosts(opts?: {
  promptDay?: string;
  /** ISO timestamp — return only takes older than this (next page of the feed). */
  before?: string;
  /** ObjectId tiebreak for `before` so same-ms posts are never skipped. */
  beforeId?: string;
}): Promise<Thought[] | null> {
  try {
    const q = new URLSearchParams({ t: String(Date.now()) });
    if (opts?.promptDay) q.set("prompt_day", opts.promptDay);
    if (opts?.before) q.set("before", opts.before);
    if (opts?.beforeId) q.set("before_id", opts.beforeId);
    const rows = await jsonFetch<RawPost[]>(`${API}/posts?${q}`);
    return rows.map(toThought);
  } catch (e) {
    console.error("fetchPulsePosts:", e);
    return null;
  }
}

/** All takes by one handle — used by profile pages (their own total, not just what's in the loaded feed). */
export async function fetchPostsByHandle(handle: string): Promise<Thought[]> {
  try {
    const q = new URLSearchParams({ handle, t: String(Date.now()) });
    const rows = await jsonFetch<RawPost[]>(`${API}/posts?${q}`);
    return rows.map(toThought);
  } catch (e) {
    console.error("fetchPostsByHandle:", e);
    return [];
  }
}

/** Takes where this handle was @mentioned in the take's own content. */
export async function fetchPostsTagged(handle: string): Promise<Thought[]> {
  try {
    const q = new URLSearchParams({ tagged: handle, t: String(Date.now()) });
    const rows = await jsonFetch<RawPost[]>(`${API}/posts?${q}`);
    return rows.map(toThought);
  } catch (e) {
    console.error("fetchPostsTagged:", e);
    return [];
  }
}

export interface ProfileInfo {
  handle: string;
  author: string;
  bio: string;
  avatarUrl: string;
  privacy?: "public" | "private" | "locked";
  /** True when the viewer may see this profile's shell but not its takes. */
  restricted?: boolean;
  /** Blue verified checkmark on the account. */
  verified?: boolean;
}

export async function fetchProfileInfo(handle: string): Promise<ProfileInfo | null> {
  try {
    const data = await jsonFetch<{ profile: ProfileInfo | null }>(
      `${API}/profile?handle=${encodeURIComponent(handle)}`
    );
    return data.profile;
  } catch (e) {
    console.error("fetchProfileInfo:", e);
    return null;
  }
}

export interface FollowConnection {
  handle: string;
  author: string;
  avatarUrl: string;
}

export interface FollowGraph {
  following: string[];
  followingProfiles: FollowConnection[];
  followers: FollowConnection[];
  isFollowedByMe?: boolean;
  followState?: "none" | "requested" | "following";
  /** The viewer blocked this account (never set for the blocked side). */
  blockedByMe?: boolean;
  /** The viewer muted this account — their takes are hidden from the feed. */
  mutedByMe?: boolean;
  /** Follower/following lists are hidden from this viewer (private/locked). */
  restricted?: boolean;
}

export async function fetchFollowGraph(handle: string): Promise<FollowGraph | null> {
  try {
    return await jsonFetch<FollowGraph>(`${API}/follows?handle=${encodeURIComponent(handle)}`);
  } catch (e) {
    console.error("fetchFollowGraph:", e);
    return null;
  }
}

export async function publishPost(
  payload: PublishInput,
  mediaBlob?: Blob | null
): Promise<{ thought: Thought } | { error: string; code?: string; retryInSec?: number }> {
  try {
    let mediaUrl = payload.mediaUrl ?? null;
    if (mediaBlob?.type.startsWith("image/")) mediaBlob = await stripImageMetadata(mediaBlob);
    if (mediaBlob) {
      const ext = mediaBlob.type.includes("webm")
        ? "webm"
        : mediaBlob.type.includes("mp4")
          ? "mp4"
          : mediaBlob.type.includes("mp3")
            ? "mp3"
            : mediaBlob.type.includes("png")
              ? "png"
              : mediaBlob.type.includes("webp")
                ? "webp"
                : mediaBlob.type.includes("jpeg") || mediaBlob.type.includes("jpg")
                  ? "jpg"
                  : "webm";
      const uploaded = await upload(`take-${Date.now()}.${ext}`, mediaBlob, {
        access: "public",
        contentType: mediaBlob.type || "application/octet-stream",
        handleUploadUrl: `${API}/upload`,
      });
      mediaUrl = uploaded.url;
    }

    const row = await jsonFetch<RawPost>(`${API}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle: payload.handle,
        author: payload.author,
        content: payload.content,
        media_type: payload.mediaType,
        feeling: payload.feeling ?? null,
        custom_feeling: payload.customFeeling ?? null,
        media_url: mediaUrl,
        media_duration: payload.mediaDuration ?? null,
        tags: payload.tags,
        language: payload.language ?? null,
        language_label: payload.languageLabel ?? null,
        integrity_hash: payload.integrity.hash,
        integrity_verified: payload.integrity.verified,
        integrity_label: payload.integrity.statusLabel,
        transcript: payload.transcript ?? null,
        from_daily_prompt: Boolean(payload.promptDay),
        prompt_day: payload.promptDay ?? null,
        prompt_text: payload.promptText ?? null,
      }),
    });
    return { thought: toThought(row) };
  } catch (e) {
    console.error("publishPost:", e);
    const err = e as Error & { code?: string; retryInSec?: number; status?: number };
    return {
      error: err.message || "Couldn’t share right now",
      code: err.code,
      retryInSec: err.retryInSec,
    };
  }
}

export async function addReaction(postId: string, reaction: string): Promise<boolean> {
  try {
    await jsonFetch(`${API}/posts/${postId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle: "anonymous", reaction }),
    });
    return true;
  } catch (e) {
    console.error("addReaction:", e);
    return false;
  }
}

/**
 * Quote-repost: a lightweight new post that embeds the original, skipping
 * the full share flow (feeling picker, media capture, integrity) since a
 * quote is commentary, not a new "how AI makes you feel" entry.
 */
export async function quoteRepost(
  quotedPostId: string,
  comment: string,
  handle: string,
  author: string
): Promise<{ thought: Thought } | { error: string; code?: string; retryInSec?: number }> {
  try {
    const row = await jsonFetch<RawPost>(`${API}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle,
        author,
        content: comment,
        media_type: "text",
        quoted_post_id: quotedPostId,
      }),
    });
    return { thought: toThought(row) };
  } catch (e) {
    console.error("quoteRepost:", e);
    const err = e as Error & { code?: string; retryInSec?: number };
    return { error: err.message || "Couldn’t repost right now", code: err.code, retryInSec: err.retryInSec };
  }
}

/** Fire-and-forget: record a view. Best-effort — a failure here shouldn't affect the reader. */
export async function markViewed(postId: string): Promise<void> {
  try {
    await jsonFetch(`${API}/posts/${postId}/view`, { method: "POST" });
  } catch (e) {
    console.error("markViewed:", e);
  }
}

export async function reportPost(
  postId: string,
  reason: string,
  context?: { handle?: string; content?: string }
): Promise<boolean> {
  try {
    await jsonFetch(`${API}/posts/${postId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        reason,
        reported_handle: context?.handle ?? null,
        content_snippet: context?.content ? context.content.slice(0, 200) : null,
      }),
    });
    return true;
  } catch (e) {
    console.error("reportPost:", e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------

export async function fetchMessages(postId: string): Promise<ChatMessage[]> {
  try {
    return await jsonFetch<ChatMessage[]>(`${API}/posts/${postId}/messages`);
  } catch (e) {
    console.error("fetchMessages:", e);
    return [];
  }
}

export async function sendMessage(
  postId: string,
  handle: string,
  author: string,
  body: string
): Promise<{ error: string } | { id: string }> {
  try {
    const row = await jsonFetch<{ ok: boolean; id: string }>(`${API}/posts/${postId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle, author, body }),
    });
    return { id: row.id };
  } catch (e) {
    console.error("sendMessage:", e);
    const msg = e instanceof Error ? e.message : "";
    return {
      error: msg && msg !== "Failed to fetch" ? msg : "Couldn't send that — try again",
    };
  }
}

/** Poll for new chat messages (Mongo has no realtime; poll lightly). */
export function subscribeToMessages(
  postId: string,
  onMessage: (msg: ChatMessage) => void
): () => void {
  let lastCount = 0;
  const seen = new Set<string>();
  let cancelled = false;

  const poll = async () => {
    if (cancelled) return;
    const msgs = await fetchMessages(postId);
    if (cancelled) return;
    for (const m of msgs) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        if (lastCount > 0) onMessage(m);
      }
    }
    lastCount = msgs.length;
  };

  void poll();
  const timer = setInterval(poll, 3000);
  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}

// ---------------------------------------------------------------------------
// Profile / keeper helpers (thin)
// ---------------------------------------------------------------------------

export async function isKeeper(handle: string): Promise<boolean> {
  // Simple handle-based keeper check against the keepers collection.
  // The server independently re-checks this on every keeper-only action —
  // this is only used to decide what to show in the UI.
  if (!handle) return false;
  try {
    const data = await jsonFetch<{ isKeeper: boolean }>(
      `${API}/keepers?handle=${encodeURIComponent(handle)}`
    );
    return data.isKeeper;
  } catch {
    return false;
  }
}

export interface ReportRow {
  id: string;
  post_id: string;
  target_type?: "post" | "comment" | "user";
  reason: string;
  reported_handle: string | null;
  content_snippet: string | null;
  status: "open" | "resolved";
  created_at: string;
}

export async function fetchReports(): Promise<ReportRow[] | null> {
  try {
    return await jsonFetch<ReportRow[]>(`${API}/reports`);
  } catch (e) {
    console.error("fetchReports:", e);
    return null;
  }
}

export async function resolveReport(reportId: string): Promise<boolean> {
  try {
    await jsonFetch(`${API}/reports/${reportId}?action=resolve`, { method: "POST" });
    return true;
  } catch (e) {
    console.error("resolveReport:", e);
    return false;
  }
}

/** Desk action on a report — resolve/dismiss/ignore/remove_post/remove_comment/ban. */
export async function moderateReport(
  reportId: string,
  action: string
): Promise<boolean> {
  try {
    await jsonFetch(`${API}/reports/${reportId}?action=${encodeURIComponent(action)}`, {
      method: "POST",
      credentials: "include",
    });
    return true;
  } catch (e) {
    console.error("moderateReport:", e);
    return false;
  }
}

export async function deletePost(postId: string): Promise<boolean> {
  try {
    // Local-only mock ids never hit Mongo
    if (!/^[a-f0-9]{24}$/i.test(postId)) return true;
    await jsonFetch(`${API}/posts/${postId}`, {
      method: "DELETE",
      credentials: "include",
    });
    return true;
  } catch (e) {
    console.error("deletePost:", e);
    return false;
  }
}

/** Hide (or restore) one of your own takes. Archived takes are visible only to you. */
export async function archivePost(postId: string, archived: boolean): Promise<boolean> {
  try {
    if (!/^[a-f0-9]{24}$/i.test(postId)) return true; // local-only mock ids
    const res = await fetch(`${API}/posts/${postId}/archive`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archived }),
    });
    return res.ok;
  } catch (e) {
    console.error("archivePost:", e);
    return false;
  }
}

export async function saveProfile(
  _userId: string,
  handle: string,
  author: string,
  extra?: { bio?: string; avatarUrl?: string }
): Promise<string | null> {
  try {
    await jsonFetch(`${API}/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle,
        author,
        bio: extra?.bio ?? "",
        avatarUrl: extra?.avatarUrl ?? "",
      }),
    });
    return null;
  } catch (e) {
    return String(e);
  }
}

function timeLabelFor(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Publish guard (kept identical — localStorage based)
// ---------------------------------------------------------------------------
export type PublishGuard = PublishResult;

const COOLDOWN_MS = 15000;
const COOLDOWN_KEY = "pulse_last_publish";
const MAX_CONTENT = 500;

export function checkPublishGuard(content: string): PublishGuard {
  const trimmed = content.trim();
  if (!trimmed) return { ok: false, reason: "empty" };
  if (trimmed.length > MAX_CONTENT) return { ok: false, reason: "too_long", max: MAX_CONTENT };
  const last = Number(localStorage.getItem(COOLDOWN_KEY) ?? 0);
  const elapsed = Date.now() - last;
  if (last && elapsed < COOLDOWN_MS) {
    return { ok: false, reason: "cooldown", retryInSec: Math.ceil((COOLDOWN_MS - elapsed) / 1000) };
  }
  return { ok: true };
}

export function markPublished(): void {
  localStorage.setItem(COOLDOWN_KEY, String(Date.now()));
}

export async function uploadTake(blob: Blob): Promise<string | null> {
  try {
    const fd = new FormData();
    const ext = blob.type.includes("webm")
      ? "webm"
      : blob.type.includes("mp4")
        ? "mp4"
        : blob.type.includes("mp3")
          ? "mp3"
          : "webm";
    fd.append("file", blob, `take.${ext}`);
    const up = await jsonFetch<{ ok: boolean; id: string }>(`${API}/upload`, {
      method: "POST",
      body: fd,
    });
    return up.ok ? `${API}/uploads/${up.id}` : null;
  } catch (e) {
    console.error("uploadTake:", e);
    return null;
  }
}
