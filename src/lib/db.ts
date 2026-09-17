import { upload } from "@vercel/blob/client";
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
  body: string;
  created_at: string;
}

// Abstractions kept identical to the old backend layer so components
// don't change. MongoDB-backed API routes do the heavy lifting server-side.

interface RawPost {
  id: string;
  handle: string;
  author: string;
  content: string;
  media_type: "audio" | "video" | "text";
  feeling?: string | null;
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
  author_joined_at?: string | null;
}

function toThought(r: RawPost): Thought {
  return {
    id: r.id,
    author: r.author || r.handle.replace(/^@/, ""),
    handle: r.handle,
    content: r.content,
    mediaType: r.media_type,
    feeling: (r.feeling as Thought["feeling"]) || undefined,
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
    authorJoinedAt: r.author_joined_at ?? undefined,
  };
}

export async function fetchPulsePosts(opts?: {
  promptDay?: string;
}): Promise<Thought[] | null> {
  try {
    const q = new URLSearchParams({ t: String(Date.now()) });
    if (opts?.promptDay) q.set("prompt_day", opts.promptDay);
    const rows = await jsonFetch<RawPost[]>(`${API}/posts?${q}`);
    return rows.map(toThought);
  } catch (e) {
    console.error("fetchPulsePosts:", e);
    return null;
  }
}

export async function publishPost(
  payload: PublishInput,
  mediaBlob?: Blob | null
): Promise<{ thought: Thought } | { error: string; code?: string; retryInSec?: number }> {
  try {
    let mediaUrl = payload.mediaUrl ?? null;
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

export interface LocalProfile {
  handle: string;
  author: string;
}

export async function getProfile(): Promise<LocalProfile | null> {
  try {
    const local = localStorage.getItem("aithoughts.profile.v1");
    if (!local) return null;
    return JSON.parse(local) as LocalProfile;
  } catch {
    return null;
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
  if (d < 30) return `${d}d`;
  return new Date(iso).toLocaleDateString();
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
