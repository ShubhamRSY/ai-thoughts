import { getSupabaseBrowser } from "./client";
import { SUPABASE_CONFIGURED } from "./config";
import type { Thought } from "@/lib/types";

interface PostRow {
  id: string;
  user_id: string | null;
  handle: string;
  author: string;
  content: string;
  media_type: "audio" | "video" | "text";
  feeling?: string | null;
  media_url?: string | null;
  media_duration?: string | null;
  tags: string[];
  language?: string | null;
  language_label?: string | null;
  integrity_hash?: string | null;
  integrity_verified?: boolean | null;
  integrity_label?: string | null;
  transcript?: unknown;
  created_at: string;
}

interface ReactRow {
  post_id: string;
  reaction: string;
}

export function isLive(): boolean {
  return SUPABASE_CONFIGURED;
}

export function timeLabelFor(iso: string): string {
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

function rowToThought(row: PostRow, reacts: ReactRow[]): Thought {
  const group: Record<string, number> = {};
  for (const r of reacts) if (r.post_id === row.id) group[r.reaction] = (group[r.reaction] ?? 0) + 1;
  return {
    id: row.id,
    author: row.author || row.handle.replace(/^@/, ""),
    handle: row.handle,
    content: row.content,
    mediaType: row.media_type,
    feeling: (row.feeling as Thought["feeling"]) || undefined,
    mediaUrl: row.media_url ?? undefined,
    mediaDuration: row.media_duration ?? undefined,
    tags: Array.isArray(row.tags) ? row.tags : [],
    timestamp: row.created_at,
    timeLabel: timeLabelFor(row.created_at),
    language: row.language ?? undefined,
    languageLabel: row.language_label ?? undefined,
    integrity: {
      hash: row.integrity_hash ?? "—",
      verified: Boolean(row.integrity_verified),
      statusLabel: row.integrity_label ?? "Signed on post",
    },
    transcript: Array.isArray(row.transcript) ? (row.transcript as Thought["transcript"]) : undefined,
    reactions: Object.entries(group).map(([type, count]) => ({ type: type as Thought["reactions"][number]["type"], count })),
  };
}

export async function fetchPulsePosts(): Promise<Thought[] | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;

  const { data: posts, error } = await sb
    .from("posts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error || !posts) {
    console.error("fetchPulsePosts:", error?.message);
    return null;
  }

  const { data: reacts } = await sb.from("post_reactions").select("post_id, reaction").limit(2000);
  const reactRows: ReactRow[] = (reacts ?? []) as ReactRow[];

  return (posts as PostRow[]).map((p) => rowToThought(p, reactRows));
}

export type PublishInput = Omit<Thought, "id" | "reactions" | "timeLabel">;

const TAKES_BUCKET = "takes";

/** Upload a raw audio/video clip to Storage, returning its public URL (or null on failure). */
export async function uploadTake(blob: Blob): Promise<string | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const ext = blob.type.includes("webm")
    ? "webm"
    : blob.type.includes("mp4")
      ? "mp4"
      : blob.type.includes("mp3")
        ? "mp3"
        : "webm";
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(TAKES_BUCKET).upload(path, blob, {
    contentType: blob.type || "application/octet-stream",
    upsert: false,
    cacheControl: "3600",
  });
  if (error) {
    console.error("uploadTake:", error.message);
    return null;
  }
  const { data } = sb.storage.from(TAKES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function publishPost(
  payload: PublishInput,
  mediaBlob?: Blob | null
): Promise<Thought | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;

  let mediaUrl = payload.mediaUrl ?? null;
  if (mediaBlob) {
    mediaUrl = await uploadTake(mediaBlob);
    if (!mediaUrl) return null; // upload failed — don't silently post a broken take
  }

  const { data, error } = await sb
    .from("posts")
    .insert({
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
      transcript: payload.transcript ? JSON.stringify(payload.transcript) : null,
    })
    .select()
    .single();
  if (error) {
    console.error("publishPost:", error.message);
    return null;
  }
  return rowToThought(data as PostRow, []);
}

export async function addReaction(postId: string, reaction: string): Promise<boolean> {
  const sb = getSupabaseBrowser();
  if (!sb) return false;
  const { error } = await sb
    .from("post_reactions")
    .insert({ post_id: postId, reaction });
  if (error) console.error("addReaction:", error.message);
  return !error;
}

/**
 * Submit a report for a post. Best-effort: in live mode it writes to the
 * `reports` table (if it exists); otherwise it only logs. Never throws.
 */
export async function reportPost(
  postId: string,
  reason: string,
  context?: { handle?: string; content?: string }
): Promise<boolean> {
  const sb = getSupabaseBrowser();
  if (!sb) return false;
  const { error } = await sb.from("reports").insert({
    post_id: postId,
    reason,
    reported_handle: context?.handle ?? null,
    content_snippet: context?.content ? context.content.slice(0, 200) : null,
  });
  if (error) console.error("reportPost:", error.message);
  return !error;
}

export async function requestMagicLink(email: string): Promise<string | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return "Supabase not configured";
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, emailRedirectTo: window.location.origin },
  });
  return error ? error.message : null;
}

export async function verifyOtp(email: string, token: string): Promise<string | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return "Supabase not configured";
  const { error } = await sb.auth.verifyOtp({ email, token, type: "email" });
  return error ? error.message : null;
}

export async function signOut(): Promise<void> {
  const sb = getSupabaseBrowser();
  await sb?.auth.signOut();
}

export async function getSessionUser() {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.auth.getUser();
  return data.user ?? null;
}

export async function saveProfile(
  userId: string,
  handle: string,
  author: string
): Promise<string | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return "Supabase not configured";
  const { error } = await sb.from("profiles").upsert(
    { id: userId, handle, author },
    { onConflict: "id" }
  );
  return error ? error.message : null;
}

export async function getProfile(userId: string) {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data, error } = await sb
    .from("profiles")
    .select("handle, author")
    .eq("id", userId)
    .maybeSingle();
  return error || !data ? null : data;
}