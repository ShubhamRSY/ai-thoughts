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

// A fresh database times some builds out; those must be retried, not skipped.
it("retries the build after an index creation times out", async () => {
  // Fresh module instance: the test above already cached a finished build.
  const fresh = "./indexes.ts?retry";
  const { ensureCoreIndexes: ensure } = (await import(fresh)) as typeof import("./indexes.ts");
  let calls = 0;
  let failFirst = true;
  const coll = {
    createIndex: async () => {
      calls++;
      if (failFirst) {
        failFirst = false;
        throw Object.assign(new Error("Timed out during socket read"), { name: "MongoOperationTimeoutError" });
      }
    },
    indexes: async () => [],
    dropIndex: async () => {},
    deleteMany: async () => ({ deletedCount: 0 }),
    aggregate: () => ({ toArray: async () => [] }),
  };
  const db = { collection: () => coll } as unknown as Db;

  await ensure(db);
  const afterFirst = calls;
  await ensure(db);
  assert.ok(calls > afterFirst, "second call rebuilds after a timeout");
  const afterRetry = calls;
  await ensure(db);
  assert.equal(calls, afterRetry, "a clean build is cached");
});
