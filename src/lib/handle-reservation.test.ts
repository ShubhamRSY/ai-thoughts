import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RESERVE_DAYS, reservationBlocks, reservedUntil } from "./handle-reservation.ts";
import { parseAdminUserIds } from "./env.ts";

const now = new Date("2026-09-30T12:00:00Z");
const held = { previous_user_id: "owner", reserved_until: reservedUntil(now) };

describe("handle reservation (H1)", () => {
  it("holds a handle for RESERVE_DAYS", () => {
    assert.equal(RESERVE_DAYS, 90);
    assert.equal(held.reserved_until.getTime() - now.getTime(), 90 * 864e5);
  });

  it("blocks new accounts and other users while held", () => {
    assert.equal(reservationBlocks(held, null, now), true);
    assert.equal(reservationBlocks(held, "someone-else", now), true);
  });

  it("lets only the previous owner reclaim it during the hold", () => {
    assert.equal(reservationBlocks(held, "owner", now), false);
  });

  it("frees the handle once the hold has passed, even before the TTL sweep", () => {
    assert.equal(reservationBlocks(held, "someone-else", held.reserved_until), false);
    assert.equal(reservationBlocks(null, "someone-else", now), false);
  });
});

describe("ADMIN_USER_IDS parsing (H1)", () => {
  it("keeps only well-formed ObjectId strings", () => {
    assert.deepEqual(
      parseAdminUserIds(" 6abc90dd62ac2af3c5b8c94e, @boss ;6ABC90DD62AC2AF3C5B8C94F  nope "),
      ["6abc90dd62ac2af3c5b8c94e", "6abc90dd62ac2af3c5b8c94f"]
    );
  });

  it("is empty when unset", () => {
    assert.deepEqual(parseAdminUserIds(undefined), []);
    assert.deepEqual(parseAdminUserIds(""), []);
  });
});
