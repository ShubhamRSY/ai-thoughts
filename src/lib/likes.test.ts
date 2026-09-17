import { test } from "node:test";
import assert from "node:assert/strict";
import { LIKE_REACTION, BOOST_REACTION, BOOKMARK_REACTION, shouldNotifyOwner } from "./likes.ts";

test("P1 bookmark privacy", () => {
  // Bookmarking must stay private — the whole point is nobody finds out.
  assert.equal(shouldNotifyOwner(BOOKMARK_REACTION), false);
  // Likes and boosts are public signals; the owner should still be notified.
  assert.equal(shouldNotifyOwner(LIKE_REACTION), true);
  assert.equal(shouldNotifyOwner(BOOST_REACTION), true);
  assert.equal(shouldNotifyOwner("🔥"), true);
});
