import { issueSignedToken, presignUrl, type IssuedSignedToken } from "@vercel/blob";
import { reportError } from "./report-error.ts";

/**
 * Takes' audio, video and photos live in a *private* Blob store: the file URL
 * alone opens nothing. Viewers get a short-lived signed link, and only from
 * routes that already checked they may see the take. Avatars stay on the
 * public store (strangers see them in search).
 *
 * BLOB_PRIVATE_READ_WRITE_TOKEN unset = uploads stay public, as before.
 */
export function privateBlobToken(): string | null {
  return process.env.BLOB_PRIVATE_READ_WRITE_TOKEN || null;
}

export function isPrivateBlobUrl(url: string): boolean {
  try {
    return new URL(url).hostname.toLowerCase().endsWith(".private.blob.vercel-storage.com");
  } catch {
    return false;
  }
}

/** Read-write token for whichever store holds this URL (for del/get). */
export function blobTokenFor(url: string): string | undefined {
  return (isPrivateBlobUrl(url) ? privateBlobToken() : process.env.BLOB_READ_WRITE_TOKEN) ?? undefined;
}

// How long a signed link works. A tab left open longer needs a feed refresh.
const LINK_TTL_MS = 60 * 60_000;

// One store-wide read delegation per instance, renewed while it still covers a
// full link lifetime; each link is then signed locally (no network call).
let delegation: Promise<IssuedSignedToken> | null = null;
let delegationUntil = 0;

function readDelegation(token: string): Promise<IssuedSignedToken> {
  if (!delegation || delegationUntil - Date.now() < LINK_TTL_MS + 60_000) {
    delegationUntil = Date.now() + 2 * LINK_TTL_MS;
    delegation = issueSignedToken({ token, operations: ["get"], validUntil: delegationUntil }).catch((e) => {
      delegation = null;
      throw e;
    });
  }
  return delegation;
}

/**
 * Signed, expiring link for a private file. Public and legacy URLs pass
 * through unchanged. Fails closed: null (media not shown) if signing fails.
 */
export async function signMediaUrl(url: string | null | undefined): Promise<string | null> {
  if (!url || !isPrivateBlobUrl(url)) return url ?? null;
  const token = privateBlobToken();
  if (!token) return null;
  try {
    const { presignedUrl } = await presignUrl(await readDelegation(token), {
      operation: "get",
      access: "private",
      pathname: decodeURIComponent(new URL(url).pathname.slice(1)),
      validUntil: Date.now() + LINK_TTL_MS,
    });
    return presignedUrl;
  } catch (e) {
    reportError(e, { route: "lib/media-access", service: "blob" });
    return null;
  }
}
