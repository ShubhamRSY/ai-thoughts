import { test } from "node:test";
import assert from "node:assert/strict";
import { dbName } from "./mongodb.ts";

test("only a production build touches the configured database", () => {
  assert.equal(dbName("aithoughts", "production"), "aithoughts");
  assert.equal(dbName("aithoughts", "development"), "aithoughts_dev");
  assert.equal(dbName("aithoughts", "test"), "aithoughts_dev");
  assert.equal(dbName("aithoughts", undefined), "aithoughts_dev");
  assert.equal(dbName("aithoughts_dev", "development"), "aithoughts_dev");
});
