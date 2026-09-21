/**
 * Dignity filter — allows hard truths and criticism about AI,
 * blocks vulgar abuse, slurs, and sexual content.
 */

const BLOCKED_PATTERNS: RegExp[] = [
  // Explicit sexual content
  /\b(porn|porno|xxx|onlyfans|nude|nudes|naked pics?|sex tape|blowjob|handjob|deepthroat|cumshot|creampie|anal\b|vagina|penis|cock\b|dick\b|pussy|boobs?|tits?\b|hentai|nsfw)\b/i,
  // Slurs & dehumanizing abuse (partial; not exhaustive)
  /\b(nigg[ae]r|faggot|retard|tranny|kike|chink|spic\b|wetback)\b/i,
  // Graphic violence invitations
  /\b(rape|raping|molest|behead|lynch)\b/i,
  // Extreme harassment patterns
  /\b(kill\s+yourself|kys\b|go\s+die)\b/i,
  // Compact variants (matched against spaces/punctuation-stripped input):
  // "killyourself", "kill me"/"killme", "sextape", "nakedpics"
  /killyourself|kill\s*me\b/i,
  /\bsextape\b|\bnakedpics?\b/i,
];

/** Soften common false positives for AI critique contexts */
const ALLOW_IF_CONTEXT: RegExp[] = [
  /\b(sexism|sexual harassment|consent|abuse of power)\b/i,
];

// Terms even a "context"-backed post can never use.
const HARD_ABUSE_SOURCE =
  /porn|xxx|nigg|faggot|retard|tranny|blowjob|handjob|cumshot|pussy|hentai|kill|sex|naked/i;

/** Common leetspeak substitutions (covers the vast majority of bot spam). */
const LEET_MAP: Record<string, string> = {
  "0": "o",
  "2": "z",
  "3": "e",
  "4": "a",
  "5": "s",
  "6": "g",
  "7": "t",
  "8": "b",
  "9": "g",
  "@": "a",
  $: "s",
  "!": "i",
  "|": "i",
};

/**
 * Collapse common leetspeak so the filters catch disguised spam.
 * "1" is ambiguous (reads as "i" in "k1ll" or "l" in "ki11"), so callers can
 * pick either reading — checkDignity runs both.
 */
export function deobfuscate(
  text: string,
  opts: { oneAs?: "i" | "l" } = {}
): string {
  const one = opts.oneAs ?? "i";
  return text.replace(/[0-9@$!|]/g, (c) => {
    if (c === "1") return one;
    return LEET_MAP[c] ?? c;
  });
}

/** Would this single variant violate the dignity filter? */
function isVariantBlocked(v: string): boolean {
  if (ALLOW_IF_CONTEXT.some((r) => r.test(v))) {
    for (const p of BLOCKED_PATTERNS) {
      if (HARD_ABUSE_SOURCE.test(p.source) && p.test(v)) return true;
    }
  } else {
    for (const p of BLOCKED_PATTERNS) {
      if (p.test(v)) return true;
    }
  }
  return false;
}

export type DignityResult =
  | { ok: true }
  | { ok: false; reason: string };

export function checkDignity(text: string): DignityResult {
  const raw = text.trim();
  if (!raw) return { ok: true };

  // The same abuse written with digits swapped in ("k1ll y0urs3lf") or with
  // separators between letters ("po rn") is caught by re-scanning the
  // deobfuscated and punctuation-free forms alongside the original. "1" is
  // tested as both "i" and "l" because leetspeak is ambiguous ("k1ll" vs
  // "ki11").
  const candidates: string[] = [raw];
  for (const oneAs of ["i", "l"] as const) {
    const leet = deobfuscate(raw, { oneAs });
    candidates.push(leet, leet.replace(/[^a-zA-Z0-9]/g, ""));
  }
  const variants = Array.from(new Set(candidates));

  for (const v of variants) {
    if (isVariantBlocked(v)) {
      return {
        ok: false,
        reason:
          "Please keep this respectful. Strong opinions about AI are welcome — sexual content, slurs, and harm are not.",
      };
    }
  }

  // Excessive punctuation / all-caps scream walls (soft check)
  const letters = raw.replace(/[^a-zA-Z]/g, "");
  if (letters.length > 40) {
    const upper = letters.replace(/[^A-Z]/g, "").length;
    if (upper / letters.length > 0.85) {
      return {
        ok: false,
        reason: "Try writing in a calmer voice so others can read and respond with care.",
      };
    }
  }

  return { ok: true };
}

export function normalizeTag(raw: string): string | null {
  let t = raw.trim().replace(/\s+/g, "");
  if (!t) return null;
  if (!t.startsWith("#")) t = `#${t}`;
  t = t.replace(/[^#A-Za-z0-9_\u00C0-\u024F]/g, "");
  if (t.length < 2 || t.length > 32) return null;
  return t;
}
