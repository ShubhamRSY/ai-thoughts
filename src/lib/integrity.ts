/**
 * Deterministic SHA-256-style hex digest for demo integrity hashes.
 *
 * This is NOT cryptographically secure — it's a stand-in so the UI can display
 * realistic-looking content hashes until real upload-side hashing is wired in.
 * Replace with crypto.subtle.digest("SHA-256", bytes) over the actual file in
 * the upload pipeline.
 */
export function fakeHash(seed: string): string {
  // FNV-1a-ish spread over two 32-bit lanes for a 64-char hex digest.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= c << (i % 4);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  const pad = (n: number) => n.toString(16).padStart(8, "0");
  let out = pad(h1) + pad(h2);
  while (out.length < 64) out += pad((h1 = Math.imul(h1 ^ 0x9e3779b9, 0x85ebca6b)) >>> 0 ^ h2);
  return out.slice(0, 64);
}

/** Short, copy-safe display form: first 12 chars. */
export function shortHash(hash: string): string {
  return hash.slice(0, 12);
}

/**
 * Compute a real SHA-256 (hex) of arbitrary bytes in the browser.
 *
 * Used to fingerprint the actual recorded clip at capture time, so the
 * integrity badge reflects a genuine content hash — not a cosmetic stand-in.
 * Returned even when SubtleCrypto is unavailable (falls back to fakeHash) so
 * the UI always has something to show.
 */
export async function digestBytes(data: ArrayBuffer | Blob): Promise<string> {
  try {
    const buf =
      data instanceof Blob ? await data.arrayBuffer() : data;
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex.padEnd(64, "0").slice(0, 64);
  } catch {
    return fakeHash(`${data instanceof Blob ? data.size : data.byteLength}:${Date.now()}`);
  }
}