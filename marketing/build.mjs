// AiTo promo video: voiceover + music + frames -> marketing/out/aito-promo.mp4
//
//   node marketing/build.mjs              full render
//   node marketing/build.mjs still 14.5   one PNG at t=14.5s -> marketing/.work/still.png
//
// Voiceover: local Kokoro neural voice (see tts.py). To use your own voice, record one file per line
// (marketing/vo/1.wav … 8.wav; wav/m4a/mp3/aiff) — scenes stretch to fit each recording.
import { chromium } from "@playwright/test";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const WORK = join(HERE, ".work"), OUT = join(HERE, "out"), VO = join(HERE, "vo");
[WORK, OUT, VO].forEach((d) => mkdirSync(d, { recursive: true }));

const FPS = 30, SR = 44100, LEAD = 0.3, TAIL = 0.45, END_HOLD = 1.5; // scene = voice + lead + tail; last scene holds longer
// [voiceover line, DESIGNED scene length in seconds]. Scenes are choreographed at the designed length, then
// time-squeezed (k = actual/designed) to fit the voice — so the video is as long as the script, no more.
// "Aito" is spelled for the voice, not the logo.
const SCRIPT = [
  ["Everyone has an opinion about AI.", 4.5],
  ["Tips. Debates. Hot takes. But almost nobody asks, how does it actually make you feel?", 8.5],
  ["Meet Aito. One calm place to say it. Love it, fear it, or both.", 7],
  ["Every day, tap one feeling. It takes five seconds, and it builds your week.", 7.5],
  ["Want to say more? Speak it, film it, or write a few honest words.", 7],
  ["Then feel with others. See how the community feels this week, and sit with people who get it.", 8],
  ["No ads. We never sell your data. And real humans moderate.", 8.5],
  ["Aito. Say how AI makes you feel. Open Voices at aito dot social.", 7],
];

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], ...opts }).toString();
const dur = (f) => parseFloat(sh("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]));

// ---- 1. voiceover clips + timeline -------------------------------------------------------
// Voice: Kokoro neural TTS (tts.py, offline). Falls back to macOS `say` if its venv isn't set up.
const own = SCRIPT.map((_, i) => ["wav", "m4a", "mp3", "aiff"].map((e) => join(VO, `${i + 1}.${e}`)).find(existsSync));
// Regenerate a clip only if its text changed (Kokoro takes ~30s per line).
const stale = (out, text) => !existsSync(out) || !existsSync(out + ".txt") || readFileSync(out + ".txt", "utf8") !== text;
const jobs = SCRIPT.flatMap(([text], i) => (own[i] || !stale(join(WORK, `vo${i + 1}.wav`), text) ? [] : [{ out: join(WORK, `vo${i + 1}.wav`), text }]));
if (jobs.length) {
  const py = join(WORK, "tts-venv/bin/python");
  if (existsSync(py) && existsSync(join(WORK, "kokoro-v1.0.onnx"))) {
    writeFileSync(join(WORK, "lines.json"), JSON.stringify(jobs));
    sh(py, [join(HERE, "tts.py"), join(WORK, "lines.json")], { cwd: HERE });
    jobs.forEach((j) => writeFileSync(j.out + ".txt", j.text));
  } else {
    console.warn("Kokoro not set up — using the macOS voice (setup is in the header of marketing/tts.py)");
    for (const j of jobs) sh("say", ["-v", "Samantha", "-r", "160", "-o", j.out, "--data-format=LEI16@22050", j.text]);
  }
}
const clips = SCRIPT.map((_, i) => { const file = own[i] ?? join(WORK, `vo${i + 1}.wav`); return { file, len: dur(file) }; });
let cursor = 0;
const TL = {
  scenes: SCRIPT.map(([, designed], i) => {
    const d = Math.max(clips[i].len + LEAD + (i === SCRIPT.length - 1 ? END_HOLD : TAIL), designed * 0.5);
    const s = { start: cursor, dur: d, vo: cursor + LEAD, k: d / designed };
    cursor += d;
    return s;
  }),
};
const TOTAL = cursor;
console.log("timeline:", TL.scenes.map((s) => `${s.start.toFixed(1)}+${s.dur.toFixed(1)}`).join("  "), `total ${TOTAL.toFixed(1)}s`);

// ---- 2. page ------------------------------------------------------------------------------
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto("file://" + join(HERE, "scene.html"));
await page.evaluate(() => document.fonts.ready);
const { sfx } = await page.evaluate((tl) => window.build(tl), TL);

if (process.argv[2] === "still") {
  await page.evaluate((t) => window.seek(t), parseFloat(process.argv[3] ?? "0"));
  await page.screenshot({ path: join(WORK, "still.png") });
  await browser.close();
  process.exit(0);
}

// ---- 3. music bed + sfx (synthesised, no assets) ---------------------------------------------
let seed = 7;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32) * 2 - 1;
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };

function writeWav(path, L, R) {
  const n = L.length, buf = Buffer.alloc(44 + n * 4);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write("WAVEfmt ", 8);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(n * 4, 40);
  const c = (v) => Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
  for (let i = 0; i < n; i++) { buf.writeInt16LE(c(L[i]), 44 + i * 4); buf.writeInt16LE(c(R[i]), 46 + i * 4); }
  writeFileSync(path, buf);
}

function music(len) {
  const n = Math.ceil(len * SR), L = new Float32Array(n), R = new Float32Array(n), TAU = Math.PI * 2;
  const chords = [ // Am9 · Fmaj7 · Cmaj9 · Gsus — root first
    [110, 220, 261.63, 329.63, 493.88], [87.31, 174.61, 220, 261.63, 329.63],
    [130.81, 261.63, 329.63, 392, 493.88], [98, 196, 246.94, 293.66, 440],
  ];
  const CH = 5;
  for (let c = 0; c * CH < len + CH; c++) {
    const ch = chords[c % 4], t0 = c * CH;
    ch.forEach((f, k) => {
      const amp = k === 0 ? 0.2 : 0.085, pan = k % 2 ? 0.3 : -0.3;
      for (let i = Math.max(0, Math.floor((t0 - 0.8) * SR)); i < Math.min(n, Math.floor((t0 + CH + 1.8) * SR)); i++) {
        const t = i / SR, env = smooth((t - (t0 - 0.8)) / 2) * (1 - smooth((t - (t0 + CH - 0.6)) / 2.2));
        const s = amp * env * (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 1.004 * t) + 0.3 * Math.sin(TAU * 2 * f * t) + 0.12 * Math.sin(TAU * 3 * f * t));
        L[i] += s * (1 - pan) * 0.5; R[i] += s * (1 + pan) * 0.5;
      }
    });
    for (let j = 0; j < 8; j++) { // soft plucks, one every 0.625s
      const tj = t0 + j * 0.625, f = ch[[1, 3, 2, 4, 3, 2, 4, 1][j]] * 2, pan = j % 2 ? 0.5 : -0.5;
      for (let i = Math.floor(tj * SR); i < Math.min(n, Math.floor((tj + 1.4) * SR)); i++) {
        const u = i / SR - tj, s = 0.06 * Math.exp(-u * 3.4) * (1 - Math.exp(-u * 250)) * (Math.sin(TAU * f * u) + 0.25 * Math.sin(TAU * 2 * f * u));
        L[i] += s * (1 - pan) * 0.5; R[i] += s * (1 + pan) * 0.5;
      }
    }
  }
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  for (let i = 0; i < n; i++) { L[i] *= 0.6 / pk; R[i] *= 0.6 / pk; }
  return [L, R];
}

function sfxTrack(len, hits) {
  const n = Math.ceil(len * SR), L = new Float32Array(n), R = new Float32Array(n), TAU = Math.PI * 2;
  for (const { t, type } of hits) {
    const i0 = Math.floor(t * SR);
    if (type === "pop") {
      let ph = 0;
      for (let i = 0; i < 0.22 * SR && i0 + i < n; i++) { const u = i / SR; ph += TAU * (260 + 520 * Math.exp(-u * 10)) / SR; const s = 0.42 * Math.exp(-u * 20) * Math.sin(ph); L[i0 + i] += s; R[i0 + i] += s; }
    } else if (type === "tick") {
      for (let i = 0; i < 0.06 * SR && i0 + i < n; i++) { const u = i / SR, s = 0.3 * Math.exp(-u * 85) * Math.sin(TAU * 1900 * u); L[i0 + i] += s; R[i0 + i] += s; }
    } else { // whoosh: rising filtered noise
      let a = 0, b = 0;
      for (let i = 0; i < 1.0 * SR && i0 + i < n; i++) {
        const u = i / SR, k = 1 - Math.exp(-TAU * (250 + 3600 * u * u) / SR), env = Math.pow(Math.sin(Math.PI * Math.min(1, u)), 2) * 0.32;
        a += k * (rnd() - a); b += k * (rnd() - b); L[i0 + i] += a * env; R[i0 + i] += b * env;
      }
    }
  }
  return [L, R];
}

const AUDIO_LEN = TOTAL + 1;
writeWav(join(WORK, "bed.wav"), ...music(AUDIO_LEN));
writeWav(join(WORK, "sfx.wav"), ...sfxTrack(AUDIO_LEN, sfx));

// ---- 4. mix: voice on top, music ducked under it ------------------------------------------
const N = clips.length;
const fc = [
  ...clips.map((_, i) => { const ms = Math.round(TL.scenes[i].vo * 1000); return `[${i + 2}]aresample=${SR},aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v${i}]`; }),
  `${clips.map((_, i) => `[v${i}]`).join("")}amix=inputs=${N}:normalize=0[vo0]`,
  `[vo0]highpass=f=90,acompressor=threshold=-18dB:ratio=3:attack=5:release=120,volume=1.7,asplit=2[voa][vob]`,
  `[0]aecho=0.8:0.55:80|170:0.22|0.12,volume=0.8[bed]`,
  `[bed][voa]sidechaincompress=threshold=0.02:ratio=10:attack=30:release=500[bd]`,
  `[1]volume=0.55[sf]`,
  `[vob][bd][sf]amix=inputs=3:normalize=0:duration=longest,alimiter=limit=0.92,afade=t=in:d=0.8,afade=t=out:st=${(TOTAL - 1.8).toFixed(2)}:d=1.8[out]`,
].join(";");
sh("ffmpeg", ["-y", "-i", join(WORK, "bed.wav"), "-i", join(WORK, "sfx.wav"), ...clips.flatMap((c) => ["-i", c.file]),
  "-filter_complex", fc, "-map", "[out]", "-t", TOTAL.toFixed(2), "-c:a", "aac", "-b:a", "192k", join(WORK, "audio.m4a")]);
console.log("audio mixed");

// ---- 5. frames -> mp4 ---------------------------------------------------------------------
const outFile = join(OUT, "aito-promo.mp4");
const ff = spawn("ffmpeg", ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "pipe:0", "-i", join(WORK, "audio.m4a"),
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "copy", "-shortest", "-movflags", "+faststart", outFile], { stdio: ["pipe", "ignore", "inherit"] });
const done = new Promise((res, rej) => { ff.on("close", (c) => (c === 0 ? res() : rej(new Error("ffmpeg exit " + c)))); });
const frames = Math.round(TOTAL * FPS);
for (let f = 0; f < frames; f++) {
  await page.evaluate((t) => window.seek(t), f / FPS);
  const jpg = await page.screenshot({ type: "jpeg", quality: 92 });
  if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once("drain", r));
  if (f % 150 === 0) console.log(`frame ${f}/${frames}`);
}
ff.stdin.end();
await done;
await browser.close();
console.log("done ->", outFile);
