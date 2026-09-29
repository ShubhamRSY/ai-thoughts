import { del } from "@vercel/blob";
import { blobTokenFor } from "./media-access.ts";

/** True when URL is our Vercel Blob media (safe to delete on wipe). */
export function isOurBlobUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.endsWith(".public.blob.vercel-storage.com") ||
      host.endsWith(".private.blob.vercel-storage.com") ||
      host === "blob.vercel-storage.com"
    );
  } catch {
    return false;
  }
}

/** Collect unique media URLs from a post-like document. */
export function mediaUrlsFromPost(post: {
  media_url?: string | null;
  stream_url?: string | null;
  avatar_url?: string | null;
  avatarUrl?: string | null;
}): string[] {
  return [post.media_url, post.stream_url, post.avatar_url, post.avatarUrl].filter(
    (u): u is string => typeof u === "string" && u.length > 0
  );
}

/**
 * Best-effort delete of our blob objects. Never throws — wipe must continue
 * even if a file is already gone or the token is missing in local dev.
 */
export async function deleteBlobUrls(
  urls: (string | null | undefined)[]
): Promise<{ attempted: number; deleted: number }> {
  const unique = [
    ...new Set(
      urls.filter((u): u is string => typeof u === "string" && isOurBlobUrl(u))
    ),
  ];
  if (unique.length === 0) return { attempted: 0, deleted: 0 };

  let deleted = 0;
  await Promise.all(
    unique.map(async (url) => {
      try {
        await del(url, { token: blobTokenFor(url) });
        deleted += 1;
      } catch {
        /* already deleted or no token — ignore */
      }
    })
  );
  return { attempted: unique.length, deleted };
}

/**
 * Strip emails, phones, and IPv4 addresses before sending text to any
 * third-party service (e.g. translation). Keeps meaning, drops contact PII.
 */
export function scrubPiiForExternal(text: string): string {
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[email]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip]")
    .replace(
      /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{2,4}\)?[\s.-]?)\d{2,4}[\s.-]?\d{3,4}(?:\s?(?:ext\.?|x)\s?\d+)?/gi,
      "[phone]"
    );
}

/** Redact emails in free-form log / report snippets. */
export function redactForStorage(text: string, maxLen = 200): string {
  return scrubPiiForExternal(text).slice(0, maxLen);
}

/** Mask an email for UI that shouldn't show the full address (keep domain). */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***";
  const head = local?.slice(0, 1) || "";
  return `${head}***@${domain}`;
}
