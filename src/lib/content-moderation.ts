import { reportError } from "./report-error.ts";
import type { TranscriptSegment } from "./types.ts";
/**
 * Automated screening of a take's text and photo with OpenAI's free
 * omni-moderation model. Off unless OPENAI_API_KEY is set.
 *
 * Fails open (logs, returns false): an OpenAI outage must not stop everyone
 * from posting — reports and keepers still catch what gets through.
 * Audio/video go through transcribeMedia first (see screenMediaPost).
 */
export async function isFlaggedContent(opts: { text?: string; imageUrl?: string | null }): Promise<boolean> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return false;
  const input: object[] = [];
  if (opts.text?.trim()) input.push({ type: "text", text: opts.text.slice(0, 2000) });
  if (opts.imageUrl) input.push({ type: "image_url", image_url: { url: opts.imageUrl } });
  if (input.length === 0) return false;
  try {
    const res = await fetch("https://api.openai.com/v1/moderations", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: "omni-moderation-latest", input }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) throw new Error(`moderation ${res.status}`);
    const data = (await res.json()) as { results?: { flagged?: boolean }[] };
    return Boolean(data.results?.some((r) => r.flagged));
  } catch (e) {
    console.error("content moderation unavailable, allowing:", e);
    reportError(e, { route: "lib/content-moderation", service: "openai" });
    return false;
  }
}

// OpenAI's transcription upload limit. Bigger clips skip screening (reports
// and keepers still cover them); takes are capped at 2 minutes, so this is rare.
const TRANSCRIBE_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Time-coded transcript of an audio/video take via OpenAI speech-to-text.
 * Returns null when off (no OPENAI_API_KEY), too large, or unavailable — the
 * same fail-open rule as isFlaggedContent.
 */
export async function transcribeMedia(url: string): Promise<TranscriptSegment[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  try {
    const media = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!media.ok) throw new Error(`media fetch ${media.status}`);
    if (Number(media.headers.get("content-length")) > TRANSCRIBE_MAX_BYTES) return null;
    const file = await media.blob();
    if (file.size > TRANSCRIBE_MAX_BYTES) return null;

    const form = new FormData();
    // OpenAI detects the format from the file name, so keep the blob's extension.
    form.append("file", file, new URL(url).pathname.split("/").pop() || "take.webm");
    form.append("model", "whisper-1");
    form.append("response_format", "verbose_json");
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) throw new Error(`transcription ${res.status}`);
    const data = (await res.json()) as { segments?: { start?: number; text?: string }[] };
    return (data.segments ?? [])
      .map((seg) => ({ time: Number(seg.start) || 0, text: String(seg.text ?? "").trim() }))
      .filter((seg) => seg.text);
  } catch (e) {
    console.error("transcription unavailable, skipping:", e);
    reportError(e, { route: "lib/content-moderation", service: "openai" });
    return null;
  }
}
