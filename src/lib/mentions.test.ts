import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractMentions,
  normHandle,
  mentionQueryAt,
  splitMentionParts,
} from "./mentions.ts";

test("extractMentions finds, lowercases, and dedupes handles", () => {
  assert.deepEqual(extractMentions("Hi @Maya and @maya and @Dex"), ["maya", "dex"]);
  assert.deepEqual(extractMentions("no handles here"), []);
  assert.deepEqual(extractMentions("email user@example.com is not a mention"), []);
});

test("extractMentions allows the handle charset and caps length", () => {
  assert.deepEqual(extractMentions("@a_b.c-d"), ["a_b.c-d"]);
  // Max 40 charset chars; a longer run is truncated by the regex.
  const long = "@" + "a".repeat(45);
  assert.deepEqual(extractMentions(long), ["a".repeat(40)]);
  // "@" with no handle chars is not a mention.
  assert.deepEqual(extractMentions("see @ "), []);
});

test("mentions inside words or mid-run are anchored to separator", () => {
  // The @ must be its own token boundary for a mention to count.
  assert.deepEqual(extractMentions("abc@def no"), []);
  assert.deepEqual(extractMentions("(@maya)"), ["maya"]);
});

test("normHandle strips @ and trims and lowercases", () => {
  assert.equal(normHandle("  @Maya  "), "maya");
  assert.equal(normHandle("maya"), "maya");
});

test("mentionQueryAt finds the caret query", () => {
  assert.deepEqual(mentionQueryAt("hello @may", 10), {
    query: "may",
    start: 6,
    end: 10,
  });
  // Mid-token: query is only the typed part (caret sits after the "ma").
  assert.deepEqual(mentionQueryAt("hello @maya", 9), { query: "ma", start: 6, end: 9 });
  // No @ before caret.
  assert.equal(mentionQueryAt("hello world", 5), null);
  // Bare @ with a caret right after it opens the picker (empty query).
  assert.deepEqual(mentionQueryAt("hello @", 7), { query: "", start: 6, end: 7 });
});

test("mentionQueryAt respects charset and doesn't span spaces", () => {
  assert.deepEqual(mentionQueryAt("@maya.Dex_2", 11), {
    query: "maya.dex_2",
    start: 0,
    end: 11,
  });
  // A space right before the caret terminates the query.
  assert.equal(mentionQueryAt("@maya ", 6), null);
  assert.equal(mentionQueryAt("@maya.Dex_2 and stuff", 12), null);
});

test("splitMentionParts marks mentions and keeps plain text", () => {
  assert.deepEqual(splitMentionParts("Hi @Maya, how are you?"), [
    { type: "text", value: "Hi " },
    { type: "mention", value: "@Maya" },
    { type: "text", value: ", how are you?" },
  ]);
});

test("splitMentionParts handles edge layouts", () => {
  assert.deepEqual(splitMentionParts("@maya"), [{ type: "mention", value: "@maya" }]);
  assert.deepEqual(splitMentionParts("no mentions"), [{ type: "text", value: "no mentions" }]);
  assert.deepEqual(splitMentionParts("@a @b!x"), [
    { type: "mention", value: "@a" },
    { type: "text", value: " " },
    { type: "mention", value: "@b" },
    { type: "text", value: "!x" },
  ]);
});