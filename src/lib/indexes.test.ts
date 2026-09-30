import assert from "node:assert/strict";
import { it } from "node:test";
import type { Db } from "mongodb";
import { ensureCoreIndexes } from "./indexes.ts";

// L2: /api/health calls ensureCoreIndexes on every request. It must build
// once per instance — including when the first requests arrive together.
it("builds indexes once, even for concurrent first callers", async () => {
  let createIndex = 0;
  const coll = {
    createIndex: async () => void createIndex++,
    indexes: async () => [],
    dropIndex: async () => {},
    deleteMany: async () => ({ deletedCount: 0 }),
    aggregate: () => ({ toArray: async () => [] }),
  };
  const db = { collection: () => coll } as unknown as Db;

  await Promise.all([ensureCoreIndexes(db), ensureCoreIndexes(db), ensureCoreIndexes(db)]);
  const afterFirst = createIndex;
  assert.ok(afterFirst > 0);
  await ensureCoreIndexes(db);
  assert.equal(createIndex, afterFirst);
});
