import assert from "node:assert/strict";
import { it } from "node:test";
import type { Db } from "mongodb";
import { isNewDevice, listSessions } from "./sessions.ts";

const UA_CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
const UA_CHROME_MAC_NEWER =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36";
const UA_IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile Safari/604.1";

type Row = Record<string, unknown>;
type Query = Row & { $or?: Query[] };

/** Minimal sessions collection: one row per (sid), with the real query shapes. */
const fakeDb = (rows: Row[]) => {
  // $or is a condition alongside the other keys, not a replacement for them.
  const matches = (row: Row, q: Query): boolean => {
    const plain = Object.entries(q).filter(([k]) => k !== "$or");
    const okPlain = plain.every(([k, v]) => {
      if (k === "user_id") return row.user_id === v;
      if (v && typeof v === "object" && "$exists" in v) {
        return (v as { $exists: boolean }).$exists ? row[k] !== undefined : row[k] === undefined;
      }
      return row[k] === v;
    });
    const or = q.$or;
    const okOr = !or || or.some((clause) => matches(row, clause));
    return okPlain && okOr;
  };
  const coll = {
    countDocuments: async (q: Query) => rows.filter((r) => matches(r, q)).length,
    find: (q: Query) => ({
      sort: () => ({
        limit: () => ({
          toArray: async () =>
            rows
              .filter((r) => matches(r, q))
              .sort((a: Row, b: Row) => Number(b.last_seen_at) - Number(a.last_seen_at)),
        }),
      }),
    }),
  };
  return { collection: () => coll } as unknown as Db;
};

const row = (over: Row = {}): Row => ({
  sid: "sid-1",
  user_id: "u1",
  user_agent: UA_CHROME_MAC,
  device_label: "Chrome on macOS",
  created_at: new Date("2026-10-01T10:00:00Z"),
  last_seen_at: new Date("2026-10-02T10:00:00Z"),
  ...over,
});

it("treats an unseen device as new", async () => {
  const db = fakeDb([row()]);
  assert.equal(await isNewDevice(db, "u1", UA_IPHONE), true);
});

it("treats a device that already has a session as known", async () => {
  const db = fakeDb([row()]);
  assert.equal(await isNewDevice(db, "u1", UA_CHROME_MAC), false);
});

// A Chrome auto-update rewrites the User-Agent. Comparing the raw string would
// report a familiar device as new on every browser release.
it("stays quiet when only the browser version changed", async () => {
  const db = fakeDb([row()]);
  assert.equal(await isNewDevice(db, "u1", UA_CHROME_MAC_NEWER), false);
});

// Rows written before device_label existed have no such field; they must still
// match, or every existing account alerts once on the deploy that adds it.
it("recognises legacy rows that have no device_label", async () => {
  const db = fakeDb([row({ device_label: undefined })]);
  assert.equal(await isNewDevice(db, "u1", UA_CHROME_MAC), false);
});

it("does not mistake another account's device for this one's", async () => {
  const db = fakeDb([row({ user_id: "someone-else" })]);
  assert.equal(await isNewDevice(db, "u1", UA_CHROME_MAC), true);
});

// Two devices can share a label ("Chrome on macOS"). An empty UA is that case
// taken to its extreme: it must alert once, then stay quiet.
it("alerts only once when the client sends no user-agent", async () => {
  const first = fakeDb([]);
  assert.equal(await isNewDevice(first, "u1", null), true);
  const second = fakeDb([row({ user_agent: "", device_label: "Unknown device" })]);
  assert.equal(await isNewDevice(second, "u1", null), false);
});

it("lists the stored device label, falling back for legacy rows", async () => {
  const db = fakeDb([row({ sid: "a" }), row({ sid: "b", device_label: undefined })]);
  const [current, legacy] = await listSessions(db, "u1", "b");
  assert.equal(current.label, "Chrome on macOS");
  assert.equal(current.current, false);
  assert.equal(legacy.label, "Chrome on macOS", "derived from user_agent when absent");
  assert.equal(legacy.current, true);
});