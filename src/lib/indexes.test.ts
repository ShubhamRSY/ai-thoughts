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

// An older build created the messages keys under Mongo's auto-generated name, so
// every createIndex for them is rejected 85/86 (same keys, different name).
// buildCoreIndexes logs those rejections instead of failing, which left the reply
// index silently missing — every feed load full-scanned. The build must drop the
// stale name and build the intended one instead.
it("repairs an index left under a different name", async () => {
  const fresh = "./indexes.ts?conflict";
  const { ensureCoreIndexes: ensure } = (await import(fresh)) as typeof import("./indexes.ts");

  // Mirrors Mongo's rule: same key spec under a different name is a conflict.
  const existing: Array<{ name: string; key: Record<string, number> }> = [
    { name: "post_id_1_created_at_1", key: { post_id: 1, created_at: 1 } },
  ];
  const autoName = (keys: Record<string, number>) =>
    Object.entries(keys).map(([k, v]) => `${k}_${v}`).join("_");
  const sameSpec = (a: Record<string, number>, b: Record<string, number>) =>
    JSON.stringify(Object.entries(a)) === JSON.stringify(Object.entries(b));

  const messages = {
    createIndex: async (keys: Record<string, number>, opts: { name?: string } = {}) => {
      const name = opts.name ?? autoName(keys);
      const clash = existing.find((i) => sameSpec(i.key, keys) && i.name !== name);
      if (clash) {
        throw Object.assign(new Error(`Index already exists with a different name: ${clash.name}`), {
          code: 86, // IndexKeySpecsConflict
        });
      }
      existing.push({ name, key: keys });
    },
    indexes: async () => existing.map((e) => ({ ...e })),
    dropIndex: async (name: string) => {
      const i = existing.findIndex((e) => e.name === name);
      if (i >= 0) existing.splice(i, 1);
    },
    deleteMany: async () => ({ deletedCount: 0 }),
    aggregate: () => ({ toArray: async () => [] }),
  };
  const inert = {
    createIndex: async () => {},
    indexes: async () => [],
    dropIndex: async () => {},
    deleteMany: async () => ({ deletedCount: 0 }),
    aggregate: () => ({ toArray: async () => [] }),
  };
  const db = { collection: (name: string) => (name === "messages" ? messages : inert) } as unknown as Db;

  await ensure(db);

  assert.ok(
    !existing.some((i) => i.name === "post_id_1_created_at_1"),
    "drops the auto-named index"
  );
  assert.ok(
    existing.some((i) => i.name === "messages_post_created"),
    "builds the index under the name lib/indexes.ts asks for"
  );
});
