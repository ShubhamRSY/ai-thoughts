// Regenerates iOS / Android / desktop icons + splash screens from public/icons/app-icon.svg.
// Run: node scripts/gen-native-icons.mjs
import sharp from "sharp";
import { readFileSync, writeFileSync, copyFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const R = (...p) => join(ROOT, ...p);
const master = readFileSync(R("public/icons/app-icon.svg"), "utf8");
const DEFS = master.match(/<defs>[\s\S]*?<\/defs>/)[0];
const GLYPH = master.slice(master.indexOf("<path mask"), master.indexOf("</svg>"));
const CREAM = "#f2f0eb"; // capacitor.config.ts SplashScreen backgroundColor

// glyph bbox in 512-space: x 120..392, y 88..440 → centre (256,264), height 352
const glyphAt = (size, frac, body) =>
  `<g transform="translate(${size / 2} ${size / 2}) scale(${(frac * size) / 352}) translate(-256 -264)">${body}</g>`;

const svg = (w, h, inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${DEFS}${inner}</svg>`;

const bgLayers = (s) =>
  ["bg", "glow", "warm"].map((id) => `<rect width="${s}" height="${s}" fill="url(#${id})"/>`).join("");

const fullBleed = (s, frac = 0.69) => svg(s, s, bgLayers(s) + glyphAt(s, frac, GLYPH));
const glyphOnly = (s, frac) => svg(s, s, glyphAt(s, frac, GLYPH));
const bgOnly = (s) => svg(s, s, bgLayers(s));

const png = (s, opts) => sharp(Buffer.from(s)).png(opts).toBuffer();
const write = async (path, buf) => (writeFileSync(R(path), await buf), console.log("wrote", path));

// rounded tile from the master (keeps its rx) resized to `px`
const tile = (px) => sharp(Buffer.from(master)).resize(px).png().toBuffer();

async function splash(w, h) {
  const t = Math.round(Math.min(w, h) * 0.28);
  return sharp({ create: { width: w, height: h, channels: 3, background: CREAM } })
    .composite([{ input: await tile(t), gravity: "centre" }])
    .png()
    .toBuffer();
}

// iOS — universal icon must be opaque, full-bleed 1024
await write(
  "ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png",
  sharp(Buffer.from(fullBleed(1024))).removeAlpha().png().toBuffer(),
);
const iosSplash = await splash(2732, 2732);
for (const f of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"])
  await write(`ios/App/App/Assets.xcassets/Splash.imageset/${f}`, iosSplash);

// Android — legacy + round launcher, adaptive fg/bg, splash
const DENS = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [d, k] of Object.entries(DENS)) {
  const dir = `android/app/src/main/res/mipmap-${d}`;
  const legacy = Math.round(48 * k);
  const adaptive = Math.round(108 * k);
  await write(`${dir}/ic_launcher.png`, tile(legacy));
  const circle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${legacy}" height="${legacy}"><circle cx="${legacy / 2}" cy="${legacy / 2}" r="${legacy / 2}"/></svg>`);
  await write(
    `${dir}/ic_launcher_round.png`,
    sharp(Buffer.from(fullBleed(legacy))).composite([{ input: circle, blend: "dest-in" }]).png().toBuffer(),
  );
  // adaptive: 66/108 safe zone → keep the glyph ≤ ~56% of the canvas
  await write(`${dir}/ic_launcher_foreground.png`, png(glyphOnly(adaptive, 0.56)));
  await write(`${dir}/ic_launcher_bg.png`, png(bgOnly(adaptive)));
}
for (const f of ["ic_launcher.xml", "ic_launcher_round.xml"]) {
  const p = R("android/app/src/main/res/mipmap-anydpi-v26", f);
  writeFileSync(p, readFileSync(p, "utf8").replace("@color/ic_launcher_background", "@mipmap/ic_launcher_bg"));
}
const resDir = R("android/app/src/main/res");
for (const d of readdirSync(resDir).filter((n) => /^drawable(-(port|land)-\w+)?$/.test(n))) {
  const p = join(resDir, d, "splash.png");
  try { statSync(p); } catch { continue; }
  const { width, height } = await sharp(p).metadata();
  await write(`android/app/src/main/res/${d}/splash.png`, splash(width, height));
}

// Desktop (electron-builder picks build/icon.png up by convention)
await write("desktop/build/icon.png", tile(512));

// Web copies bundled into the shells (cap sync overwrites these anyway)
for (const shell of ["ios/App/App/public/icons", "android/app/src/main/assets/public/icons"])
  for (const f of ["app-icon.svg", "app-icon.svg.png", "icon-192.png", "icon-512.png", "apple-touch-icon.png"])
    copyFileSync(R("public/icons", f), R(shell, f));
console.log("done");
