import sharp from "sharp";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "desktop", "build", "appx");
mkdirSync(OUT, { recursive: true });

const BG = `<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#7c3aed"/>
      <stop offset=".55" stop-color="#4f46e5"/>
      <stop offset="1" stop-color="#312e81"/>
    </linearGradient>
    <radialGradient id="glow" cx=".28" cy=".18" r=".75">
      <stop offset="0" stop-color="#c4b5fd" stop-opacity=".65"/>
      <stop offset="1" stop-color="#c4b5fd" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="warm" cx=".9" cy="1" r=".55">
      <stop offset="0" stop-color="#e879f9" stop-opacity=".28"/>
      <stop offset="1" stop-color="#f472b6" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="body" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#c7d2fe"/>
    </linearGradient>
    <linearGradient id="head" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#ffffff"/>
      <stop offset="1" stop-color="#ede9fe"/>
    </linearGradient>
    <linearGradient id="feel" gradientUnits="userSpaceOnUse" x1="190" y1="0" x2="322" y2="0">
      <stop offset="0" stop-color="#ec4899"/>
      <stop offset=".5" stop-color="#8b5cf6"/>
      <stop offset="1" stop-color="#2563eb"/>
    </linearGradient>
    <linearGradient id="rim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff" stop-opacity=".45"/>
      <stop offset=".4" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <mask id="cut">
      <rect width="512" height="512" fill="#fff"/>
      <circle cx="256" cy="176" r="102" fill="#000"/>
    </mask>
    <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="7"/></filter>`;

// Glyph drawn in 512-space; true color, transparent background
const GLYPH_COLOR = `
  <path mask="url(#cut)" d="M120 412C120 325.6 180.8 264 256 264C331.2 264 392 325.6 392 412C392 427.2 379.2 440 364 440H148C132.8 440 120 427.2 120 412Z" fill="url(#body)"/>
  <circle cx="256" cy="176" r="88" fill="url(#head)"/>
  <g stroke="url(#feel)" stroke-width="10" stroke-linecap="round" fill="url(#feel)">
    <g filter="url(#soft)" opacity=".55">
      <circle cx="256" cy="176" r="24" stroke="none"/>
      <circle cx="198" cy="142" r="14" stroke="none"/>
      <circle cx="316" cy="144" r="14" stroke="none"/>
    </g>
    <line x1="256" y1="176" x2="198" y2="142"/>
    <line x1="256" y1="176" x2="316" y2="144"/>
    <line x1="256" y1="176" x2="226" y2="222"/>
    <line x1="256" y1="176" x2="302" y2="217"/>
    <circle cx="198" cy="142" r="14" stroke="none"/>
    <circle cx="316" cy="144" r="14" stroke="none"/>
    <circle cx="226" cy="222" r="11" stroke="none"/>
    <circle cx="302" cy="217" r="11" stroke="none"/>
    <circle cx="256" cy="176" r="24" stroke="none"/>
  </g>
  <circle cx="256" cy="176" r="9" fill="#fff"/>
`;

// Monochrome (white) version for the badge
const GLYPH_MONO = `
  <path d="M120 412C120 325.6 180.8 264 256 264C331.2 264 392 325.6 392 412C392 427.2 379.2 440 364 440H148C132.8 440 120 427.2 120 412Z" fill="#ffffff"/>
  <circle cx="256" cy="176" r="88" fill="#ffffff"/>

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
  <rect width="${width}" height="${height}" fill="url(#glow)"/>
  <rect width="${width}" height="${height}" fill="url(#warm)"/>
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