import assert from "node:assert/strict";
import { it } from "node:test";
import type { Db } from "mongodb";
import { getPushStatus } from "./push.ts";

type Row = Record<string, unknown>;
type Query = Row & { handle?: { $in?: unknown[] } };

const at = (n: number) => n * 1000;

/**
 * The two shapes getPushStatus uses: handle $in, then sort(updated_at desc)
 * → limit → toArray. Other helpers in push.ts need .skip(); not exercised here.
 */
const fakeDb = (rows: Row[]): Db => {
  const matches = (row: Row, q: Query): boolean => {
    const $in = q.handle?.$in;
    if ($in) return $in.includes(row.handle);
    return Object.entries(q).every(([k, v]) => row[k] === v);
  };
  const coll = {
    find: (q: Query) => ({
      sort: () => ({
        limit: (n: number) => ({
          toArray: async () =>
            rows
              .filter((r) => matches(r, q))
              .sort((a, b) => Number(b.updated_at) - Number(a.updated_at))
              .slice(0, n),
        }),
      }),
    }),
  };
  return { collection: () => coll } as unknown as Db;
};

const sub = (handle: string, endpoint: string, updated_at: number): Row => ({
  handle,
  endpoint,
  updated_at: at(updated_at),
});

it("counts this account's subscriptions only, ignoring other accounts", async () => {
  const db = fakeDb([
    sub("@alice", "https://push.example/one", 5),
    sub("@alice", "https://push.example/two", 4),
    sub("@bob", "https://push.example/bob1", 3),
    sub("@bob", "https://push.example/bob2", 2),
    sub("@bob", "https://push.example/bob3", 1),
  ]);
  assert.deepEqual(await getPushStatus(db, "@alice", null), { count: 2, mine: false });
});

it("matches an unnormalised handle, since callers store session.handle as-is", async () => {
  const db = fakeDb([sub("@alice", "https://push.example/one", 5)]);
  assert.deepEqual(await getPushStatus(db, "alice", null), { count: 1, mine: false });
  assert.deepEqual(await getPushStatus(db, "@alice", null), { count: 1, mine: false });
});

it("caps the count at the same newest-first limit the send fan-out uses", async () => {
  // updated_at rises with i, so push.example/12 is the newest row.
  const rows = Array.from({ length: 13 }, (_, i) => sub("@alice", `https://push.example/${i}`, i));
  const db = fakeDb(rows);

  const kept = await getPushStatus(db, "@alice", "https://push.example/12");
  assert.equal(kept.count, 10);
  assert.equal(kept.mine, true);

  // Past the cap the device is effectively unregistered — the fan-out would
  // never reach it, and saying otherwise is exactly the lie we're avoiding.
  const dropped = await getPushStatus(db, "@alice", "https://push.example/0");
  assert.equal(dropped.count, 10);
  assert.equal(dropped.mine, false);
});

it("reports mine only when this browser's endpoint is among the live set", async () => {
  const rows = [sub("@alice", "https://push.example/one", 2), sub("@alice", "https://push.example/two", 1)];
  const db = fakeDb(rows);
  assert.equal((await getPushStatus(db, "@alice", "https://push.example/one")).mine, true);
  assert.equal((await getPushStatus(db, "@alice", "https://push.example/two")).mine, true);
  assert.equal((await getPushStatus(db, "@alice", "https://push.example/gone")).mine, false);
});

it("reports no channel when nothing is registered — the count-only case", async () => {
  assert.deepEqual(await getPushStatus(fakeDb([]), "@alice", null), { count: 0, mine: false });
});

it("a subscription whose handle belongs to someone else is not mine", async () => {
  const db = fakeDb([sub("@bob", "https://push.example/mine", 1)]);
  assert.deepEqual(await getPushStatus(db, "@alice", "https://push.example/mine"), {
    count: 0,
    mine: false,
  });
});
