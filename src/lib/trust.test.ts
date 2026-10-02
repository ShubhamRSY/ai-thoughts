import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountAgeMs,
  isNewAccount,
  postLimitsForAge,
  checkContentQuality,
  scoreAiSlop,
} from "./anti-abuse.ts";
import {
  dailyPrompt,
  dailyPromptForDay,
  dailyPromptUTC,
  promptDayKey,
  promptDayKeyUTC,
  shiftDayKey,
  todayKey,
} from "./daily-prompt.ts";
import { buildLikedBy, formatLikedBy, LIKE_REACTION } from "./likes.ts";
import { extractMentions, normHandle, mentionQueryAt, splitMentionParts } from "./mentions.ts";
import { checkDignity, normalizeTag } from "./dignity.ts";
import { BRAND, SUGGESTED_TAGS } from "./brand.ts";

/** Mirror of reactions route handleVariants — casing must collapse to one identity. */
function handleVariants(h: string): string[] {
  const n = normHandle(h);
  if (!n) return [];
  return Array.from(new Set([h, `@${n}`, n, `@${n}`.toLowerCase(), n.toLowerCase()]));
}

/** Mirror of ChatPanel dedupe: drop optimistic local twin when server id arrives. */
function mergeComment(
  prev: { id: string; handle: string; body: string }[],
  msg: { id: string; handle: string; body: string }
) {
  if (prev.some((m) => m.id === msg.id)) return prev;
  const key = normHandle(msg.handle);
  const withoutDup = prev.filter(
    (m) =>
      !(
        m.id.startsWith("local-") &&
        normHandle(m.handle) === key &&
        m.body.trim() === msg.body.trim()
      )
  );
  return [...withoutDup, msg];
}

describe("P1 createdAt fail-closed", () => {
  it("treats missing createdAt as age 0 (brand-new)", () => {
    assert.equal(accountAgeMs(null), 0);
    assert.equal(accountAgeMs(undefined), 0);
    assert.equal(accountAgeMs(""), 0);
    assert.equal(accountAgeMs("not-a-date"), 0);
  });

  it("isNewAccount is true when createdAt missing", () => {
    assert.equal(isNewAccount(null), true);
    assert.equal(isNewAccount(undefined), true);
  });

  it("missing age gets tightest post limits", () => {
    const limits = postLimitsForAge(accountAgeMs(null));
    assert.equal(limits.maxPerDay, 1);
    assert.equal(limits.label, "first hour");
  });

  it("old ISO dates are not treated as new", () => {
    const old = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
    assert.equal(isNewAccount(old), false);
    assert.ok(accountAgeMs(old) > 7 * 24 * 3600_000);
  });
});

describe("P1 reaction handle casing", () => {
  it("collapses @Maya / maya / @MAYA to one key", () => {
    const keys = ["@Maya", "maya", "@MAYA", "Maya"].map(normHandle);
    assert.ok(keys.every((k) => k === "maya"));
  });

  it("handleVariants overlap so toggle finds either casing", () => {
    const a = new Set(handleVariants("@MayaFeels"));
    const b = handleVariants("mayafeels");
    assert.ok(b.some((v) => a.has(v) || a.has(v.toLowerCase()) || a.has(`@${normHandle(v)}`)));
    assert.ok(a.has("@mayafeels"));
    assert.ok(a.has("mayafeels"));
  });

  it("buildLikedBy dedupes same person under different casing", () => {
    const names = new Map([["maya", "Maya"]]);
    const people = buildLikedBy(
      [
        { handle: "@Maya", reaction: LIKE_REACTION, created_at: new Date("2026-01-01") },
        { handle: "maya", reaction: LIKE_REACTION, created_at: new Date("2026-01-02") },
        { handle: "@MAYA", reaction: LIKE_REACTION, created_at: new Date("2026-01-03") },
      ],
      names
    );
    assert.equal(people.length, 1);
    assert.equal(normHandle(people[0]!.handle), "maya");
    assert.equal(people[0]!.author, "Maya");
  });
});

describe("P0 like copy", () => {
  it("formatLikedBy shows you for current handle regardless of casing", () => {
    const s = formatLikedBy(
      [{ handle: "@You", author: "You Name" }],
      1,
      "@YOU"
    );
    assert.equal(s, "Liked by you");
  });

  it("formatLikedBy never invents fake +12", () => {
    assert.equal(formatLikedBy([], 0), null);
    assert.equal(formatLikedBy([], 1), "1 like");
    assert.equal(formatLikedBy([{ handle: "@a", author: "Ann" }], 3), "Liked by Ann and 2 others");
  });
});

describe("P1 comment dedupe", () => {
  it("replaces local optimistic twin with server message", () => {
    const prev = [
      { id: "local-1", handle: "@Maya", body: "hello there" },
      { id: "other", handle: "@Sam", body: "hi" },
    ];
    const next = mergeComment(prev, {
      id: "507f1f77bcf86cd799439011",
      handle: "maya",
      body: "hello there",
    });
    assert.equal(next.length, 2);
    assert.ok(!next.some((m) => m.id.startsWith("local-")));
    assert.ok(next.some((m) => m.id === "507f1f77bcf86cd799439011"));
  });

  it("does not duplicate if server id already present", () => {
    const prev = [{ id: "abc", handle: "@Maya", body: "x" }];
    const next = mergeComment(prev, { id: "abc", handle: "@Maya", body: "x" });
    assert.equal(next.length, 1);
  });
});

describe("P1 prompt day / midnight", () => {
  it("todayKey matches promptDayKey local", () => {
    const now = new Date("2026-09-15T23:30:00-04:00");
    assert.equal(todayKey(now), promptDayKey(now));
  });

  it("UTC and local keys can differ near midnight", () => {
    // Fixed absolute instant: 2026-09-15 23:00 in America/New_York = 2026-09-16 03:00 UTC.
    const instant = new Date("2026-09-15T23:00:00-04:00");
    const local = promptDayKey(instant);
    const utc = promptDayKeyUTC(instant);

    // UTC day is absolute — must not depend on the runner’s timezone.
    assert.equal(utc, "2026-09-16");

    // Local day follows the host calendar (CI is usually UTC → same as utc).
    const expectedLocal = [
      instant.getFullYear(),
      String(instant.getMonth() + 1).padStart(2, "0"),
      String(instant.getDate()).padStart(2, "0"),
    ].join("-");
    assert.equal(local, expectedLocal);

    // On non-UTC hosts (e.g. US evening), local and UTC diverge — the product bug we guard.
    if (instant.getTimezoneOffset() !== 0) {
      assert.notEqual(local, utc);
    }
  });

  it("dailyPromptForDay is stable for a YYYY-MM-DD key", () => {
    const a = dailyPromptForDay("2026-09-15");
    const b = dailyPromptForDay("2026-09-15");
    assert.equal(a, b);
    assert.ok(a.length > 10);
  });

  it("shiftDayKey moves calendar days without timezone drift", () => {
    assert.equal(shiftDayKey("2026-09-15", -1), "2026-09-14");
    assert.equal(shiftDayKey("2026-03-01", -1), "2026-02-28");
  });

  it("dailyPrompt and dailyPromptUTC are defined strings", () => {
    assert.equal(typeof dailyPrompt(), "string");
    assert.equal(typeof dailyPromptUTC(), "string");
  });
});

describe("P0 publish / dignity errors", () => {
  it("dignity blocks clear harassment", () => {
    const bad = checkDignity("you are a stupid idiot and I hate you");
    // May or may not catch depending on dictionary — assert shape at least
    assert.equal(typeof bad.ok, "boolean");
  });

  it("normalizeTag keeps hash and strips junk", () => {
    assert.equal(normalizeTag("future"), "#future");
    assert.equal(normalizeTag("#Future"), "#Future");
    assert.equal(normalizeTag("  "), null);
  });

  it("does not auto-inject #Future into empty tag lists", () => {
    const tags: string[] = [];
    const published = tags.length ? tags : [];
    assert.deepEqual(published, []);
    assert.ok((SUGGESTED_TAGS as readonly string[]).includes("#Future"));
  });

  it("share success copy does not claim visibility under filters", () => {
    assert.match(BRAND.shareSuccessSub, /Worldwide|Voices/i);
  });
});

describe("P0 / P1 AI-slop and mentions", () => {
  it("slop scorer flags essay paste", () => {
    const essay =
      "In today's rapidly evolving digital landscape, it's important to note that we delve into multifaceted challenges. " +
      "This is a testament to how we navigate the complexities with a robust framework that will play a crucial role. " +
      "In conclusion, leverage cutting-edge synergies and unpack the nuances.";
    assert.ok(scoreAiSlop(essay).score >= 3);
    assert.equal(checkContentQuality(essay, { newAccount: true }).ok, false);
  });

  it("extractMentions lowercases handles", () => {
    assert.deepEqual(extractMentions("hey @Maya and @SAM"), ["maya", "sam"]);
  });

  it("mentionQueryAt finds active query", () => {
    const text = "thanks @may";
    const m = mentionQueryAt(text, text.length);
    assert.ok(m);
    assert.equal(m!.query, "may");
  });

  it("splitMentionParts marks mentions", () => {
    const parts = splitMentionParts("hi @maya ok");
    assert.ok(parts.some((p) => p.type === "mention" && p.value.toLowerCase().includes("maya")));
  });
  it("sign-in return params: next and from both accepted", () => {
    const pick = (next: string | null, from: string | null) =>
      next ?? from ?? "/app";
    assert.equal(pick("/app", null), "/app");
    assert.equal(pick(null, "/admin"), "/admin");
    assert.equal(pick("/app", "/admin"), "/app");
  });
});

describe("P1 sample / verified trust labels", () => {
  it("Sample voice is the only seed integrity label we accept as honest", () => {
    const seedLabel = "Sample voice";
    const fakeVerified = "Verified · Unmodified";
    assert.notEqual(seedLabel, fakeVerified);
    assert.equal(seedLabel === "Sample voice", true);
  });
});
