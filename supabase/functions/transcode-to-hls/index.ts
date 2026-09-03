// ============================================================
// transcode-to-hls — Supabase Edge Function (Deno)
//
// Turns a raw uploaded take (mp4/webm/mp3) in the public "takes" bucket
// into an HLS (m3u8) adaptive stream in the "hls" bucket, then sets
// posts.stream_url + stream_ready = true for that take.
//
// USAGE
//   POST /functions/v1/transcode-to-hls
//   Authorization: Bearer <anon key>
//   { "post_id": "<uuid>", "source_path": "abc.webm" }
//
// HLS transcoding needs a real encoder. If TRANSCODE_ENDPOINT is set (a
// provider that accepts { source_url, format } and returns
// { manifest_path } inside the hls bucket), we use it. Otherwise, for
// short clips we publish a passthrough manifest so the pipeline still
// works end-to-end and you can drop in ffmpeg/Mux/Cloudflare later.
// ============================================================

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const TRANSCODE_ENDPOINT = Deno.env.get("TRANSCODE_ENDPOINT") ?? null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function setPostStream(postId: string, streamUrl: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/posts?id=eq.${postId}`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ stream_url: streamUrl, stream_ready: true }),
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { post_id, source_path } = await req.json();
    if (!post_id || !source_path) {
      return json({ error: "post_id and source_path are required" }, 400);
    }

    const sourceUrl = `${SUPABASE_URL}/storage/v1/object/public/takes/${source_path}`;

    if (TRANSCODE_ENDPOINT) {
      const res = await fetch(TRANSCODE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source_url: sourceUrl, format: "hls" }),
      });
      if (!res.ok) return json({ error: "Transcoder failed" }, 502);
      const data = await res.json();
      await setPostStream(post_id, data.manifest_path);
      return json({ ok: true, stream_ready: true });
    }

    // Passthrough fallback: reference the raw file as the stream so the
    // feature is usable before a real encoder is wired in.
    await setPostStream(post_id, sourceUrl);
    return json({
      ok: true,
      stream_ready: true,
      note: "passthrough (no TRANSCODE_ENDPOINT set)",
      stream_url: sourceUrl,
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
