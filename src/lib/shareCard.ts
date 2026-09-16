"use client";

import type { Thought } from "@/lib/types";
import { feelingOf } from "@/lib/feelings";
import { BRAND } from "@/lib/brand";

const SIZE = 1080;
const PAD = 90;

function cssFont(varName: string): string {
  if (typeof document === "undefined") return "";
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(test).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function truncateQuote(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max).trimEnd()}…`;
}

/** Renders a take as a shareable square PNG card, entirely client-side. */
export async function renderThoughtCard(thought: Thought): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const displayFont = cssFont("--font-fraunces") || "Georgia, serif";
  const sansFont = cssFont("--font-manrope") || "system-ui, sans-serif";

  ctx.fillStyle = "#f2f0eb";
  ctx.fillRect(0, 0, SIZE, SIZE);

  ctx.save();
  ctx.beginPath();
  ctx.arc(SIZE + 60, -60, 340, 0, Math.PI * 2);
  ctx.fillStyle = "#dce8e5";
  ctx.fill();
  ctx.restore();

  const feeling = feelingOf(thought.feeling);
  if (feeling) {
    const label = feeling.short.toUpperCase();
    ctx.font = `700 30px ${sansFont}`;
    const chipPadX = 28;
    const chipW = ctx.measureText(label).width + chipPadX * 2;
    const chipH = 64;
    ctx.fillStyle = "#dce8e5";
    ctx.beginPath();
    ctx.roundRect(PAD, PAD, chipW, chipH, chipH / 2);
    ctx.fill();
    ctx.fillStyle = "#163832";
    ctx.textBaseline = "middle";
    ctx.fillText(label, PAD + chipPadX, PAD + chipH / 2 + 2);
  }

  const quote = truncateQuote(thought.content, 220);
  // Quote centers between the feeling chip (top) and the footer (bottom).
  const contentTop = PAD + 64 + 70;
  const contentBottom = SIZE - PAD - 46 - 70;
  const maxWidth = SIZE - PAD * 2;
  const maxBlockHeight = contentBottom - contentTop;
  ctx.fillStyle = "#1a1a1a";
  ctx.textBaseline = "alphabetic";

  let fontSize = quote.length > 140 ? 56 : quote.length > 80 ? 66 : 78;
  let lines: string[] = [];
  while (fontSize > 36) {
    ctx.font = `500 ${fontSize}px ${displayFont}`;
    lines = wrapLines(ctx, `“${quote}”`, maxWidth);
    if (lines.length * fontSize * 1.22 <= maxBlockHeight) break;
    fontSize -= 4;
  }
  ctx.font = `500 ${fontSize}px ${displayFont}`;
  const lineHeight = fontSize * 1.22;
  const blockHeight = lines.length * lineHeight;
  let y = contentTop + (maxBlockHeight - blockHeight) / 2 + fontSize * 0.8;
  for (const line of lines) {
    ctx.fillText(line, PAD, y);
    y += lineHeight;
  }

  ctx.font = `700 32px ${sansFont}`;
  ctx.fillStyle = "#1a1a1a";
  ctx.fillText(thought.author, PAD, SIZE - PAD - 46);
  ctx.font = `400 28px ${sansFont}`;
  ctx.fillStyle = "#6b6560";
  ctx.fillText(thought.handle, PAD, SIZE - PAD - 10);

  ctx.textAlign = "right";
  ctx.font = `700 30px ${sansFont}`;
  ctx.fillStyle = "#1f4d45";
  ctx.fillText(BRAND.shortName, SIZE - PAD, SIZE - PAD - 46);
  ctx.font = `400 24px ${sansFont}`;
  ctx.fillStyle = "#6b6560";
  ctx.fillText("aito.social", SIZE - PAD, SIZE - PAD - 10);
  ctx.textAlign = "left";

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), "image/png", 0.95));
}
