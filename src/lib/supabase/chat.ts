import { getSupabaseBrowser } from "./client";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface ChatMessage {
  id: string;
  post_id: string;
  handle: string;
  author: string;
  body: string;
  created_at: string;
}

interface MessageRow extends ChatMessage {
  user_id: string | null;
}

/** Fetch recent messages for a take, oldest first. */
export async function fetchMessages(postId: string, limit = 80): Promise<ChatMessage[]> {
  const sb = getSupabaseBrowser();
  if (!sb || !postId) return [];
  const { data, error } = await sb
    .from("messages")
    .select("id, post_id, handle, author, body, created_at")
    .eq("post_id", postId)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) {
    console.error("fetchMessages:", error.message);
    return [];
  }
  return (data ?? []) as ChatMessage[];
}

/** Send a chat message on a take. Returns null on success or an error string. */
export async function sendMessage(
  postId: string,
  handle: string,
  author: string,
  body: string
): Promise<string | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return "Chat is offline";
  const trimmed = body.trim();
  if (!trimmed) return null;
  const { error } = await sb.from("messages").insert({
    post_id: postId,
    handle,
    author,
    body: trimmed.slice(0, 600),
  });
  if (error) {
    console.error("sendMessage:", error.message);
    return "Couldn't send that — try again";
  }
  return null;
}

/**
 * Subscribe to new messages on a take using Supabase Realtime.
 * Returns an unsubscribe function. Handles transient connection loss
 * by re-subscribing automatically (realtime-js retries internally).
 */
export function subscribeToMessages(
  postId: string,
  onMessage: (msg: ChatMessage) => void
): () => void {
  const sb = getSupabaseBrowser();
  if (!sb || !postId) return () => {};

  const channel: RealtimeChannel = sb
    .channel(`messages:${postId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `post_id=eq.${postId}`,
      },
      (payload) => {
        const row = payload.new as MessageRow;
        onMessage({
          id: row.id,
          post_id: row.post_id,
          handle: row.handle,
          author: row.author,
          body: row.body,
          created_at: row.created_at,
        });
      }
    )
    .subscribe();

  return () => {
    sb.removeChannel(channel);
  };
}
