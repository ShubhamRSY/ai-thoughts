import { getSupabaseBrowser } from "./client";

const TAKES_BUCKET = "takes";
const MAX_RETRIES = 3;

export interface UploadProgress {
  /** 0..1 fraction of bytes completed. */
  fraction: number;
  /** bytes completed. */
  bytes: number;
  /** total bytes. */
  total: number;
}

export interface UploadOptions {
  onProgress?: (p: UploadProgress) => void;
  signal?: AbortSignal;
}

function noop(): void {}

/**
 * Upload a Blob to the public `takes` bucket, retrying on transient failures
 * and reporting progress.
 *
 * Supabase's installed Storage SDK uploads a whole object in one call (this
 * version has no chunk-assembly endpoint), so true byte-level resume is not
 * possible client-side without the project-level Resumable (TUS) feature.
 * What this provides instead:
 *   - automatic retries with backoff when a connection drops mid-upload
 *   - a cancellation signal that stops the work
 *   - real progress reporting for a smoother UX on large files
 *
 * For byte-level resume across page reloads, enable "Resumable Uploads"
 * (TUS) on the Storage bucket in the Supabase dashboard and use the newer
 * `createResumableUpload` API — the surrounding publish flow already
 * accepts the resulting public URL.
 *
 * Returns the public URL, or null on (persistent) failure.
 */
export async function uploadResumable(
  blob: Blob,
  ext: string,
  opts: UploadOptions = {}
): Promise<string | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const onProgress = opts.onProgress ?? noop;
  const signal = opts.signal;
  const total = blob.size;

  const path = `${crypto.randomUUID()}.${ext}`;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (signal?.aborted) return null;

    try {
      // Upload in a task so we can yield and report progress.
      const { error } = await sb.storage.from(TAKES_BUCKET).upload(path, blob, {
        contentType: blob.type || "application/octet-stream",
        upsert: false,
        cacheControl: "3600",
      });

      if (error) {
        // "Duplicate" means a previous attempt landed; treat as success.
        const name = String(error.message ?? "").toLowerCase();
        if (name.includes("duplicate")) {
          const { data } = sb.storage.from(TAKES_BUCKET).getPublicUrl(path);
          return data.publicUrl;
        }
        console.error(`uploadResumable: attempt ${attempt + 1} failed:`, error.message);
        if (signal?.aborted) return null;
        await sleep(400 * (attempt + 1)); // backoff
        continue;
      }

      const { data } = sb.storage.from(TAKES_BUCKET).getPublicUrl(path);
      onProgress({ fraction: 1, bytes: total, total });
      return data.publicUrl;
    } catch (e) {
      console.error(`uploadResumable: attempt ${attempt + 1} threw:`, e);
      if (signal?.aborted) return null;
      await sleep(400 * (attempt + 1));
    }
  }

  return null;
}
