/**
 * Automated screening of a take's text and photo with OpenAI's free
 * omni-moderation model. Off unless OPENAI_API_KEY is set.
 *
 * Fails open (logs, returns false): an OpenAI outage must not stop everyone
 * from posting — reports and keepers still catch what gets through.
 * ponytail: text + images only; audio/video need transcription first.
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
    return false;
  }
}
