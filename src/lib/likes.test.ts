import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LIKE_REACTION,
  BOOST_REACTION,
  BOOKMARK_REACTION,
  VALID_REACTIONS,
  isValidReaction,
  shouldNotifyOwner,
  buildLikedBy,
  formatLikedBy,
} from "./likes.ts";

test("P1 bookmark privacy", () => {
  // Bookmarking must stay private — the whole point is nobody finds out.
  assert.equal(shouldNotifyOwner(BOOKMARK_REACTION), false);
  // Likes and boosts are public signals; the owner should still be notified.
  assert.equal(shouldNotifyOwner(LIKE_REACTION), true);
  assert.equal(shouldNotifyOwner(BOOST_REACTION), true);
  assert.equal(shouldNotifyOwner("🔥"), true);
});

test("reaction whitelist only admits the product reactions", () => {
  assert.deepEqual(VALID_REACTIONS, [LIKE_REACTION, BOOST_REACTION, BOOKMARK_REACTION]);
  assert.equal(isValidReaction("❤️"), true);
  assert.equal(isValidReaction("🔁"), true);
  assert.equal(isValidReaction("🔖"), true);
  assert.equal(isValidReaction("🔥"), false);
  assert.equal(isValidReaction("abcdefgh"), false);
  assert.equal(isValidReaction(""), false);
  assert.equal(isValidReaction("❤️❤️"), false);
});

test("buildLikedBy keeps the most recent per handle", () => {
  const now = Date.now();
  const rows = [
    { handle: "@maya", created_at: new Date(now - 2000) },
    { handle: "@Maya", created_at: new Date(now - 1000) },
    { handle: "@dex", created_at: new Date(now - 3000) },
  ];
  const out = buildLikedBy(rows, new Map(), 5);
  assert.equal(out.length, 2);
  // Maya's newest row (any casing) wins the dedup; the newest is listed first.
  assert.deepEqual(out.map((o) => o.handle), ["@Maya", "@dex"]);
});

test("buildLikedBy returns [] for empty or handle-less rows", () => {
  assert.deepEqual(buildLikedBy([], new Map(), 5), []);
  assert.deepEqual(buildLikedBy([{ reaction: "❤️" }], new Map(), 5), []);
});

test("buildLikedBy respects the limit and sorts newest first", () => {
  const rows = [
    { handle: "@a", created_at: "2026-09-21T12:00:00Z" },
    { handle: "@b", created_at: "2026-09-21T13:00:00Z" },
    { handle: "@c", created_at: "2026-09-21T14:00:00Z" },
  ];
  const out = buildLikedBy(rows, new Map(), 2);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((o) => o.handle), ["@c", "@b"]);
});

test("buildLikedBy pulls author names from the name map", () => {
  const rows = [{ handle: "@maya" }];
  const out = buildLikedBy(rows, new Map([["maya", "Maya R."]]), 5);
  assert.equal(out[0].author, "Maya R.");
  // Missing names fall back to the handle (minus @).
  const fallback = buildLikedBy(rows, new Map(), 5);
  assert.equal(fallback[0].author, "maya");
});

test("formatLikedBy covers counts and names", () => {
  assert.equal(formatLikedBy([], 0, null), null);
  assert.equal(formatLikedBy([{ handle: "@maya", author: "Maya" }], 1, null), "Liked by Maya");
  assert.equal(
    formatLikedBy(
      [
        { handle: "@maya", author: "Maya" },
        { handle: "@dex", author: "Dex" },
      ],
      2,
      null
    ),
    "Liked by Maya and Dex"
  );
  assert.equal(
    formatLikedBy([{ handle: "@maya", author: "Maya" }], 3, null),
    "Liked by Maya and 2 others"
  );
});

test("formatLikedBy renders 'you' for the current user", () => {
  const out = formatLikedBy([{ handle: "@maya", author: "Maya" }], 1, "@maya");
  assert.equal(out, "Liked by you");
});