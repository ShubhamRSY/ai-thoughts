import assert from "node:assert/strict";
import { it } from "node:test";
import { dmPolicy, pairKey, requestLimitReached, MAX_REQUEST_MESSAGES } from "./dms.ts";

it("one conversation per pair, whichever side starts it", () => {
  assert.equal(pairKey("a", "b"), pairKey("b", "a"));
});

it("a block stops messages both ways, even between followers", () => {
  assert.deepEqual(dmPolicy({ blocked: true, recipientPrivacy: "public", recipientFollowsSender: true }).allowed, false);
});

it("someone who follows you gets your message directly", () => {
  assert.deepEqual(dmPolicy({ blocked: false, recipientPrivacy: "locked", recipientFollowsSender: true }), {
    allowed: true,
    request: false,
  });
});

it("strangers land in requests; locked accounts can't be messaged by strangers", () => {
  assert.deepEqual(dmPolicy({ blocked: false, recipientPrivacy: "public", recipientFollowsSender: false }), {
    allowed: true,
    request: true,
  });
  assert.deepEqual(dmPolicy({ blocked: false, recipientPrivacy: "private", recipientFollowsSender: false }), {
    allowed: true,
    request: true,
  });
  assert.equal(dmPolicy({ blocked: false, recipientPrivacy: "locked", recipientFollowsSender: false }).allowed, false);
});

it("a pending request caps the sender; acceptance lifts it", () => {
  assert.equal(requestLimitReached(false, MAX_REQUEST_MESSAGES - 1), false);
  assert.equal(requestLimitReached(false, MAX_REQUEST_MESSAGES), true);
  assert.equal(requestLimitReached(true, 50), false);
});
