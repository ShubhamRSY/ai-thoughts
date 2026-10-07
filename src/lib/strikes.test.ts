import assert from "node:assert/strict";
import { it } from "node:test";
import { pauseLengthMs, STRIKES_TO_PAUSE } from "./strikes.ts";

const DAY = 24 * 60 * 60_000;

it("pauses after repeated strikes, longer on a second round", () => {
  assert.equal(pauseLengthMs(STRIKES_TO_PAUSE - 1, STRIKES_TO_PAUSE - 1), 0);
  assert.equal(pauseLengthMs(STRIKES_TO_PAUSE, STRIKES_TO_PAUSE), DAY);
  assert.equal(pauseLengthMs(STRIKES_TO_PAUSE, STRIKES_TO_PAUSE * 2), 7 * DAY);
});
