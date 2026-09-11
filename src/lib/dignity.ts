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
];

/** Soften common false positives for AI critique contexts */
const ALLOW_IF_CONTEXT: RegExp[] = [
  /\b(sexism|sexual harassment|consent|abuse of power)\b/i,
];

export type DignityResult =
  | { ok: true }
  | { ok: false; reason: string };

export function checkDignity(text: string): DignityResult {
  const raw = text.trim();
  if (!raw) return { ok: true };

  if (ALLOW_IF_CONTEXT.some((r) => r.test(raw))) {
    // Still block hard sexual/slur terms even in “context” phrases
    const hard = BLOCKED_PATTERNS.filter((p) =>
      /porn|xxx|nigg|faggot|retard|tranny|blowjob|handjob|cumshot|pussy|hentai/i.test(
        p.source
      )
    );
    for (const p of hard) {
      if (p.test(raw)) {
        return {
          ok: false,
          reason:
            "Please keep this respectful. Strong opinions about AI are welcome — sexual content and slurs are not.",
        };
      }
    }
  }

  for (const p of BLOCKED_PATTERNS) {
    if (p.test(raw)) {
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
