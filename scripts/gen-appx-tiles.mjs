import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "desktop", "build", "appx");
mkdirSync(OUT, { recursive: true });

const BG = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#a78bfa"/>
  <stop offset="1" stop-color="#4338ca"/>
</linearGradient>`;

// Glyph drawn in 512-space; true color, transparent background
const GLYPH_COLOR = `
  <path d="M120 412C120 325.6 180.8 264 256 264C331.2 264 392 325.6 392 412C392 427.2 379.2 440 364 440H148C132.8 440 120 427.2 120 412Z" fill="#ffffff"/>
  <circle cx="256" cy="176" r="88" fill="#ffffff"/>
  <g stroke="#7c3aed" stroke-width="13" stroke-linecap="round">
    <line x1="216" y1="156" x2="292" y2="168"/>
    <line x1="216" y1="156" x2="244" y2="208"/>
    <line x1="292" y1="168" x2="244" y2="208"/>
  </g>
  <circle cx="216" cy="156" r="17" fill="#f0abfc"/>
  <circle cx="292" cy="168" r="17" fill="#f0abfc"/>
  <circle cx="244" cy="208" r="17" fill="#c084fc"/>
`;

// Monochrome (white) version for the badge
const GLYPH_MONO = `
  <path d="M120 412C120 325.6 180.8 264 256 264C331.2 264 392 325.6 392 412C392 427.2 379.2 440 364 440H148C132.8 440 120 427.2 120 412Z" fill="#ffffff"/>
  <circle cx="256" cy="176" r="88" fill="#ffffff"/>
  <path d="M216 156 L292 168 L244 208 Z" fill="#ffffff"/>
  <circle cx="216" cy="156" r="17" fill="#ffffff"/>
  <circle cx="292" cy="168" r="17" fill="#ffffff"/>
  <circle cx="244" cy="208" r="17" fill="#ffffff"/>
`;

// glyph bbox: x 120..392, y 88..440 (center ~256, 264)
const GX = 256, GY = 264, GH = 352;

function place(width, height, glyph, glyphContent) {
  // glyphContent = fraction of the constraining dimension the glyph should occupy
  const s = (glyphContent * Math.min(width, height)) / GH;
  return `translate(${width / 2} ${height / 2}) scale(${s}) translate(${-GX} ${-GY})`;
}

function tileSvg(width, height, content, glyph = GLYPH_COLOR) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>${BG}</defs>
  <rect width="${width}" height="${height}" fill="url(#bg)"/>
  <g transform="${place(width, height, glyph, content)}">${glyph}</g>
</svg>`;
}

function monoBadgeSvg(size) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <g transform="${place(size, size, GLYPH_MONO, 1.0)}">${GLYPH_MONO}</g>
</svg>`;
}

const targets = [
  ["StoreLogo.png", 50, 50, 0.74],
  ["Square44x44Logo.png", 44, 44, 0.62],
  ["SmallTile.png", 71, 71, 0.62],
  ["Square150x150Logo.png", 150, 150, 0.62],
  ["LargeTile.png", 310, 310, 0.62],
  ["Wide310x150Logo.png", 310, 150, 0.70],
  ["SplashScreen.png", 620, 300, 0.48],
];

for (const [name, w, h, content] of targets) {
  const svg = tileSvg(w, h, content);
  const png = await sharp(Buffer.from(svg), { density: 72 }).png().toBuffer();
  writeFileSync(join(OUT, name), png);
  console.log("wrote", name, w + "x" + h);
}

const png = await sharp(Buffer.from(monoBadgeSvg(24)), { density: 72 }).png().toBuffer();
writeFileSync(join(OUT, "BadgeLogo.png"), png);
console.log("wrote BadgeLogo.png 24x24");

const check = await sharp(join(OUT, "Square150x150Logo.png")).metadata();
console.log("sample dims:", check.width, "x", check.height);