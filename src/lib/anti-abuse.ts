/**
 * Anti-abuse helpers — reduce spam rings, impersonation, and low-effort AI slop.
 * Not perfect detectors; biased toward soft blocks for new accounts.
 */

import type { Db } from "mongodb";

export type AbuseCheckResult =
  | { ok: true; flags?: string[] }
  | { ok: false; reason: string; code: string; retryInSec?: number };

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

/** Brand / role names people shouldn’t look like. */
const RESERVED_HANDLE_ROOTS = [
  "admin",
  "administrator",
  "aithoughts",
  "aithought",
  "ai-thoughts",
  "ai_thoughts",
  "official",
  "keeper",
  "keepers",
  "mod",
  "moderator",
  "support",
  "help",
  "security",
  "staff",
  "team",
  "system",
  "root",
  "null",
  "undefined",
  "owner",
  "founder",
  "voices",
  "resend",
  "vercel",
];

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.org",
  "sharklasers.com",
  "grr.la",
  "tempmail.com",
  "temp-mail.org",
  "throwaway.email",
  "yopmail.com",
  "trashmail.com",
  "10minutemail.com",
  "getnada.com",
  "discard.email",
  "fakeinbox.com",
]);

/** Phrases common in generic AI essay-slop (not proof — a signal). */
const AI_SLOP_PHRASES = [
  /\bas an ai\b/i,
  /\bi('m| am) an? (large )?language model\b/i,
  /\bin today'?s (rapidly |ever-)?(evolving|changing) (digital )?landscape\b/i,
  /\bit'?s important to (note|remember|understand)\b/i,
  /\bdelve(s|d)? into\b/i,
  /\bmultifaceted\b/i,
  /\btestament to\b/i,
  /\bnavigate the complexities\b/i,
  /\bin conclusion,?\b/i,
  /\bleverage(s|d)? (cutting-edge|synergies)\b/i,
  /\brobust (framework|solution|approach)\b/i,
  /\bplay a crucial role\b/i,
  /\bgame-?changer\b/i,
  /\bunpack(ing)? the nuances\b/i,
];

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export function accountAgeMs(createdAt?: string | Date | null): number {
  // Fail closed: unknown age ⇒ treat as brand-new (tightest limits).
  if (!createdAt) return 0;
  const t = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Date.now() - t);
}

export function isNewAccount(createdAt?: string | Date | null, withinMs = 7 * DAY): boolean {
  return accountAgeMs(createdAt) < withinMs;
}

/** Daily post cap + cooldown by account age. */
export function postLimitsForAge(ageMs: number): {
  maxPerDay: number;
  cooldownMs: number;
  label: string;
} {
  if (ageMs < HOUR) {
    return { maxPerDay: 1, cooldownMs: 30 * 60_000, label: "first hour" };
  }
  if (ageMs < DAY) {
    return { maxPerDay: 3, cooldownMs: 10 * 60_000, label: "first day" };
  }
  if (ageMs < 7 * DAY) {
    return { maxPerDay: 8, cooldownMs: 3 * 60_000, label: "first week" };
  }
  return { maxPerDay: 40, cooldownMs: 15_000, label: "established" };
}

export function checkDisposableEmail(email: string): AbuseCheckResult {
  const domain = email.toLowerCase().trim().split("@")[1] || "";
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return {
      ok: false,
      code: "disposable_email",
      reason: "Please use a lasting email — temporary inboxes aren’t allowed.",
    };
  }
  return { ok: true };
}

/**
 * Strip digits/leetspeak-ish noise for reserved-name matching.
 * e.g. a1th0ughts → aithoughts, adm1n → admin
 */
export function handleFingerprint(raw: string): string {
  return normHandle(raw)
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/3/g, "e")
    .replace(/4/g, "a")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/8/g, "b")
    .replace(/[^a-z]/g, "");
}

export function checkHandleAllowed(handle: string): AbuseCheckResult {
  const n = normHandle(handle);
  if (n.length < 2) {
    return { ok: false, code: "handle_short", reason: "Handle is too short." };
  }
  const fp = handleFingerprint(n);
  for (const root of RESERVED_HANDLE_ROOTS) {
    if (fp === root) {
      return {
        ok: false,
        code: "handle_reserved",
        reason: "That handle looks like an official or reserved name. Pick another.",
      };
    }
    // Prefix match: admin123, aithoughts_x — avoid short roots matching "modern"
    if (root.length >= 5 && (fp.startsWith(root) || fp.includes(root))) {
      return {
        ok: false,
        code: "handle_reserved",
        reason: "That handle looks like an official or reserved name. Pick another.",
      };
    }
    if (root.length < 5 && (fp.startsWith(root) && /^[0-9]/.test(fp.slice(root.length) || "1"))) {
      return {
        ok: false,
        code: "handle_reserved",
        reason: "That handle looks like an official or reserved name. Pick another.",
      };
    }
  }
  return { ok: true };
}

export function checkDisplayNameAllowed(name: string): AbuseCheckResult {
  const fp = handleFingerprint(name);
  for (const root of ["aithoughts", "aithought", "officialkeeper", "admin", "moderator"]) {
    if (fp === root || fp.includes(root)) {
      return {
        ok: false,
        code: "name_reserved",
        reason: "That display name looks like an official account. Use your own name.",
      };
    }
  }
  return { ok: true };
}

/** Normalize text for duplicate comparison. */
export function normalizeContent(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9\u00c0-\u024f\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function contentFingerprint(text: string): string {
  return normalizeContent(text).slice(0, 400);
}

function wordSet(text: string): Set<string> {
  return new Set(normalizeContent(text).split(" ").filter((w) => w.length > 2));
}

export function jaccardSimilarity(a: string, b: string): number {
  const A = wordSet(a);
  const B = wordSet(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

export function scoreAiSlop(text: string): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;
  const raw = text.trim();
  const words = normalizeContent(raw).split(" ").filter(Boolean);

  for (const p of AI_SLOP_PHRASES) {
    if (p.test(raw)) {
      score += 2;
      flags.push("ai_phrase");
    }
  }

  // Long polished text with almost no first-person feeling language
  if (words.length >= 80) {
    const personal = (raw.match(/\b(i|i'm|im|me|my|mine|we|our)\b/gi) || []).length;
    if (personal < 2) {
      score += 2;
      flags.push("impersonal_long");
    }
  }

  // Very uniform sentence lengths (essay-ish)
  const sentences = raw.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 20);
  if (sentences.length >= 4) {
    const lens = sentences.map((s) => s.split(/\s+/).length);
    const avg = lens.reduce((a, b) => a + b, 0) / lens.length;
    const variance =
      lens.reduce((a, b) => a + (b - avg) ** 2, 0) / lens.length;
    if (avg > 18 && variance < 12) {
      score += 1;
      flags.push("uniform_sentences");
    }
  }

  // High density of long Latinate words
  if (words.length >= 40) {
    const long = words.filter((w) => w.length >= 10).length;
    if (long / words.length > 0.28) {
      score += 1;
      flags.push("latinate");
    }
  }

  return { score, flags: [...new Set(flags)] };
}

export function checkContentQuality(
  text: string,
  opts: { newAccount: boolean }
): AbuseCheckResult {
  const { score, flags } = scoreAiSlop(text);
  // Harder on new accounts; established users get more leeway (feelings can be long).
  const threshold = opts.newAccount ? 3 : 5;
  if (score >= threshold) {
    return {
      ok: false,
      code: "ai_slop",
      reason:
        "This reads like generic AI essay text. Say it in your own words — how AI makes *you* feel.",
      // flags unused on fail path but kept for logs via reason
    };
  }
  if (flags.length && opts.newAccount && score >= 2) {
    return {
      ok: true,
      flags,
    };
  }
  return { ok: true, flags: score > 0 ? flags : undefined };
}

export async function assertCanPost(
  db: Db,
  opts: {
    userId: string;
    handle: string;
    content: string;
    createdAt?: string | Date | null;
  }
): Promise<AbuseCheckResult> {
  const ageMs = accountAgeMs(opts.createdAt);
  const limits = postLimitsForAge(ageMs);
  const newAccount = isNewAccount(opts.createdAt);

  const quality = checkContentQuality(opts.content, { newAccount });
  if (!quality.ok) return quality;

  const dayAgo = new Date(Date.now() - DAY);
  const postsToday = await db.collection("posts").countDocuments({
    user_id: opts.userId,
    created_at: { $gte: dayAgo },
  });
  if (postsToday >= limits.maxPerDay) {
    return {
      ok: false,
      code: "daily_cap",
      reason: `New accounts can share up to ${limits.maxPerDay} take${limits.maxPerDay === 1 ? "" : "s"} per day. Come back later — quality over volume.`,
    };
  }

  const recent = await db
    .collection<{ content?: string; created_at?: Date }>("posts")
    .find({ user_id: opts.userId })
    .sort({ created_at: -1 })
    .limit(8)
    .project({ content: 1, created_at: 1 })
    .toArray();

  if (recent[0]?.created_at) {
    const elapsed = Date.now() - new Date(recent[0].created_at).getTime();
    if (elapsed < limits.cooldownMs) {
      return {
        ok: false,
        code: "cooldown",
        reason: "cooldown",
        retryInSec: Math.ceil((limits.cooldownMs - elapsed) / 1000),
      };
    }
  }

  const fp = contentFingerprint(opts.content);
  for (const p of recent) {
    const other = typeof p.content === "string" ? p.content : "";
    if (!other) continue;
    if (contentFingerprint(other) === fp) {
      return {
        ok: false,
        code: "duplicate",
        reason: "You’ve already shared this (or something almost identical).",
      };
    }
    if (jaccardSimilarity(opts.content, other) >= 0.92) {
      return {
        ok: false,
        code: "near_duplicate",
        reason: "This is too similar to something you already posted. Add a new feeling or angle.",
      };
    }
  }

  // Cross-user near-dupe against very recent global posts (coordinated copy-paste)
  if (newAccount || opts.content.length > 120) {
    const fresh = await db
      .collection<{ content?: string; user_id?: string }>("posts")
      .find({ created_at: { $gte: new Date(Date.now() - 2 * DAY) } })
      .sort({ created_at: -1 })
      .limit(40)
      .project({ content: 1, user_id: 1 })
      .toArray();
    for (const p of fresh) {
      if (p.user_id === opts.userId) continue;
      const other = typeof p.content === "string" ? p.content : "";
      if (!other || other.length < 40) continue;
      if (jaccardSimilarity(opts.content, other) >= 0.88) {
        return {
          ok: false,
          code: "copied",
          reason: "This looks copied from another take. Share your own feeling.",
        };
      }
    }
  }

  return { ok: true, flags: quality.flags };
}

/** Pick a non-reserved handle; retries with random suffix. */
export function allocateSafeHandle(emailLocal: string): string {
  const base =
    emailLocal.replace(/[^a-z0-9]/gi, "").slice(0, 10).toLowerCase() || "user";
  for (let i = 0; i < 12; i++) {
    const suffix = Math.floor(Math.random() * 9000 + 1000);
    const candidate = `@${base}${suffix}`;
    if (checkHandleAllowed(candidate).ok) return candidate;
  }
  return `@voice${Math.floor(Math.random() * 900000 + 100000)}`;
}
