/**
 * True when the leading bytes are a real audio/video/image container we can
 * play. The upload route only checks the *declared* content type, so this is
 * what catches a renamed executable, HTML page, or truncated/corrupted file
 * before it becomes a take.
 */
export function isPlayableMediaHeader(b: Uint8Array): boolean {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  if (b.length < 4) return false;
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return true; // WebM / Matroska
  if (ascii(0, 4) === "OggS") return true;
  if (ascii(0, 3) === "ID3") return true; // MP3 with tags
  if (b[0] === 0xff && (b[1] & 0xe0) === 0xe0) return true; // MPEG audio / AAC ADTS frame sync
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return true; // JPEG
  if (ascii(1, 4) === "PNG" && b[0] === 0x89) return true;
  if (ascii(0, 4) === "RIFF" && ["WAVE", "WEBP"].includes(ascii(8, 12))) return true;
  // ISO BMFF: MP4, MOV, M4A, M4V, HEIC all carry a box type at offset 4.
  return ["ftyp", "moov", "mdat", "wide", "free"].includes(ascii(4, 8));
}

// Vercel Blob serves stored objects from <store>.public.blob.vercel-storage.com
// (or <store>.private… for the private store, or the raw blob.vercel-storage.com host). Anything else on a take's media_url
// (post media and avatars alike) is rejected — the server and privacy surfaces must never interact with a
// caller-supplied host.
export const BLOB_HOST_RE = /(^|\.)blob\.vercel-storage\.com$/i;

/** `privateOk`: takes may point at the private store; avatars must stay public. */
export function isAllowedMediaUrl(url: string, privateOk = false): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  if (u.protocol !== "https:") return false;
  // Only *our* store: any Blob store matches BLOB_HOST_RE, so without this a
  // file hosted in someone else's store skipped /api/upload's type and rate
  // checks entirely. The store id is embedded in the read-write token.
  // The public store is the one BLOB_READ_WRITE_TOKEN belongs to. BLOB_STORE_ID
  // is not used: connecting a second store in Vercel sets it to *that* store.
  const storeId = process.env.BLOB_READ_WRITE_TOKEN?.match(/^vercel_blob_rw_([a-z0-9]+)_/i)?.[1];
  const privateStoreId = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN?.match(/^vercel_blob_rw_([a-z0-9]+)_/i)?.[1];
  const host = u.hostname.toLowerCase();
  if (privateOk && privateStoreId && host === `${privateStoreId.toLowerCase()}.private.blob.vercel-storage.com`) {
    return true;
  }
  if (storeId) return host === `${storeId.toLowerCase()}.public.blob.vercel-storage.com`;
  if (BLOB_HOST_RE.test(u.hostname)) return true;
  // sample media shipped with the repo, and a local dev blob host, are fine
  // outside Vercel; production is Blob-only (the recorder+image pipeline
  // always uploads to Blob anyway).
  if (process.env.NODE_ENV === "production" || process.env.VERCEL_ENV) return false;
  return u.hostname === "localhost" || u.hostname === "127.0.0.1" || url.startsWith("/media/sample-");
}

export function isBlobUrl(url: string): boolean {
  try {
    return BLOB_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Fetches the first bytes of a stored object and checks them. Fails closed. */
export async function isPlayableMediaUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { Range: "bytes=0-31" },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) return false;
    return isPlayableMediaHeader(new Uint8Array(await res.arrayBuffer()).subarray(0, 32));
  } catch {
    return false;
  }
}
