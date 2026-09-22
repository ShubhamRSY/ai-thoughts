/* eslint-disable @typescript-eslint/no-require-imports -- standalone CommonJS script, run with `node media-pipeline.cjs` */
const upload = require("@vercel/blob/client").upload;
const fs = require("fs");
const cp = require("child_process");

const BASE = "http://localhost:3010";
const XFF = "194.4.0.211";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
const cookieHeader = { origin: BASE, cookie: "", "x-forwarded-for": XFF, "user-agent": UA };

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
}

async function json(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: { "content-type": "application/json", ...cookieHeader, ...(init.headers || {}) },
  });
  const text = await res.text();
  return { res, json: text ? JSON.parse(text) : null };
}

async function signIn(displayName) {
  cookieHeader.cookie = "";
  const email = `${displayName.toLowerCase().replace(/[^a-z]+/g, "")}-${Date.now()}@example.com`;
  const s1 = await json("/api/auth/sign-in", {
    method: "POST",
    body: JSON.stringify({ email, displayName }),
  });
  assert(s1.res.status === 200, `sign-in ${s1.res.status}: ${JSON.stringify(s1.json)}`);
  const code = s1.json.devCode;
  assert(/^\d{6}$/.test(code || ""), "dev code present in sign-in response");
  const s2 = await json("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify({ email, code }),
  });
  assert(s2.res.status === 200, `verify ${s2.res.status}`);
  const setCookie = s2.res.headers.getSetCookie?.()[0] || s2.res.headers.get("set-cookie") || "";
  const m = setCookie.match(/aithoughts\.session=([^;]+)/);
  assert(m, "session cookie set after OTP verify");
  const sid = m[1];
  cookieHeader.cookie = `aithoughts.session=${sid}`;
  return { email, sid };
}

async function createMediaPost(mediaType, mediaUrl, bodyText) {
  const p = await json("/api/posts", {
    method: "POST",
    body: JSON.stringify({
      content: bodyText,
      media_type: mediaType,
      feeling: mediaType === "audio" ? "wow" : "safe",
      media_url: mediaUrl,
      media_duration: "0:02",
      tags: [],
      language: "en",
      language_label: "English",
      integrity_hash: "abc123",
      integrity_verified: true,
      integrity_label: "Capture chip · unmodified",
    }),
  });
  assert(p.res.status === 200, `POST posts(${mediaType}) ${p.res.status}: ${JSON.stringify(p.json)}`);
  assert(p.json.media_url === mediaUrl, `${mediaType}: posts stores media_url`);
  assert(p.json.media_type === mediaType, `${mediaType}: stores media_type`);
  return p.json;
}

function ffprobe(buf) {
  const f = "/tmp/blob-check";
  fs.writeFileSync(f, buf);
  return cp.execFileSync(
    "ffprobe",
    ["-v", "error", "-show_entries", "stream=codec_type,codec_name", "-of", "json", f],
    { encoding: "utf8" }
  );
}

async function head(url) {
  const r = await fetch(url, { method: "HEAD" });
  return r.status;
}

async function main() {
  const ts = Date.now();
  const audioBytes = fs.readFileSync("/tmp/aito-test.opus.webm");
  const videoBytes = fs.readFileSync("/tmp/aito-test.video.webm");

  // ===== Phase 1: Account A publishes an audio take =====
  console.log("-- account A (audio)");
  const accA = await signIn("Pipeline Audio Tester");
  const audio = await upload(`take-${ts}.webm`, audioBytes, {
    access: "public",
    contentType: "audio/webm",
    handleUploadUrl: `${BASE}/api/upload`,
    headers: cookieHeader,
  });
  console.log("audio blob uploaded:", audio.url, audioBytes.length, "B");
  assert((await head(audio.url)) === 200, "audio blob publicly readable (HEAD 200)");
  const audioPost = await createMediaPost("audio", audio.url, "Pipeline audio take.");
  console.log("audio post created:", audioPost.id);
  assert((await head(audio.url)) === 200, "audio blob still readable after post creation");

  // ===== Phase 2: Account B publishes a video take =====
  console.log("-- account B (video)");
  const accB = await signIn("Pipeline Video Tester");
  const video = await upload(`take-${ts}b.webm`, videoBytes, {
    access: "public",
    contentType: "video/webm",
    handleUploadUrl: `${BASE}/api/upload`,
    headers: cookieHeader,
  });
  console.log("video blob uploaded:", video.url, videoBytes.length, "B");
  assert((await head(video.url)) === 200, "video blob publicly readable (HEAD 200)");
  const videoPost = await createMediaPost("video", video.url, "Pipeline video take.");
  console.log("video post created:", videoPost.id);

  // ===== Phase 3: feed round-trip + decode check =====
  cookieHeader.cookie = `aithoughts.session=${accA.sid}`;
  const feed = await json("/api/posts");
  assert(feed.res.status === 200, `feed GET ${feed.res.status}`);
  const feedPosts = Array.isArray(feed.json) ? feed.json : feed.json?.posts || [];
  const inFeed = feedPosts.filter((p) => p.id === audioPost.id || p.id === videoPost.id);
  assert(inFeed.length === 2, `both media posts in feed (got ${inFeed.length})`);
  assert(inFeed.find((p) => p.id === audioPost.id)?.media_url === audio.url, "feed serializes audio media_url");
  assert(inFeed.find((p) => p.id === videoPost.id)?.media_url === video.url, "feed serializes video media_url");
  console.log("feed round-trip OK (both media posts + media_url serialized)");

  const aProbe = JSON.parse(ffprobe(Buffer.from(await (await fetch(audio.url)).arrayBuffer())));
  const vProbe = JSON.parse(ffprobe(Buffer.from(await (await fetch(video.url)).arrayBuffer())));
  const aTypes = aProbe.streams.map((s) => s.codec_type).join(",");
  const vTypes = vProbe.streams.map((s) => `${s.codec_type}:${s.codec_name}`).join(",");
  assert(aTypes.includes("audio"), `audio blob decodes (${aTypes})`);
  assert(vTypes.includes("video") && vTypes.includes("audio"), `video blob decodes as A/V (${vTypes})`);
  console.log("blob decode OK — audio:", aTypes, "| video:", vTypes);

  // ===== Phase 4: in-app deletion must remove DB row AND blob =====
  cookieHeader.cookie = `aithoughts.session=${accA.sid}`;
  const delA = await json(`/api/posts/${audioPost.id}`, { method: "DELETE" });
  assert(delA.res.status === 200, `DELETE audio post ${delA.res.status}`);
  await new Promise((r) => setTimeout(r, 1000));
  const audioGone = await head(audio.url);
  assert(audioGone === 404, `in-app delete removed the audio blob (HEAD=${audioGone} expected 404)`);

  cookieHeader.cookie = `aithoughts.session=${accB.sid}`;
  const delB = await json(`/api/posts/${videoPost.id}`, { method: "DELETE" });
  assert(delB.res.status === 200, `DELETE video post ${delB.res.status}`);
  await new Promise((r) => setTimeout(r, 1000));
  const videoGone = await head(video.url);
  assert(videoGone === 404, `in-app delete removed the video blob (HEAD=${videoGone} expected 404)`);

  console.log("in-app delete OK — both blobs removed from Vercel Blob");
  console.log("PIPELINE ALL GREEN");
}

main().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});