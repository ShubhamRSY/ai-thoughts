import { test } from "node:test";
import assert from "node:assert/strict";
import { selectExpiredBackups, DEFAULT_KEEP } from "./backup-retention.ts";
import { MAX_DOCS, backupPathname } from "./backup.ts";

const entry = (n: number) => ({
  pathname: `backups/aithoughts-2026-09-${String(n).padStart(2, "0")}T00-00-00-000Z.json.gz`,
  uploadedAt: new Date(Date.UTC(2026, 8, n)),
});

test("keeps everything when under the limit", () => {
  assert.deepEqual(selectExpiredBackups([entry(1), entry(2)], 5), []);
});

test("expires the oldest beyond the limit", () => {
  const got = selectExpiredBackups([entry(1), entry(2), entry(3), entry(4), entry(5)], 3);
  // Delete order is irrelevant, so compare as a set.
  assert.deepEqual([...got].sort(), [entry(1).pathname, entry(2).pathname].sort());
});

test("never expires the newest backup, even if asked to keep none", () => {
  const got = selectExpiredBackups([entry(1), entry(2), entry(3)], 0);
  assert.deepEqual([...got].sort(), [entry(1).pathname, entry(2).pathname].sort());
  assert.ok(!got.includes(entry(3).pathname), "newest backup must survive");
});

test("ignores blobs outside the backups prefix", () => {
  const got = selectExpiredBackups(
    [{ pathname: "media/photo.png" }, entry(1), entry(2), entry(3)],
    1
  );
  assert.ok(!got.some((p) => p.startsWith("media/")));
});

test("sorts by pathname timestamp when uploadedAt is missing", () => {
  const bare = [entry(3), entry(1), entry(2)].map((e) => ({ pathname: e.pathname }));
  assert.deepEqual(
    [...selectExpiredBackups(bare, 1)].sort(),
    [entry(1).pathname, entry(2).pathname].sort()
  );
});

test("default retention is a rolling multi-day window", () => {
  assert.ok(DEFAULT_KEEP >= 7, "a week of backups is the minimum worth keeping");
});

test("MAX_DOCS is a real ceiling, not a token value", () => {
  assert.ok(MAX_DOCS >= 50_000, "must cover this app's realistic growth for years");
});

test("pathnames sort chronologically as plain strings", () => {
  const a = backupPathname("aithoughts", "2026-09-29T04:30:00.000Z");
  const b = backupPathname("aithoughts", "2026-10-01T04:30:00.000Z");
  assert.ok(a < b, `${a} should sort before ${b}`);
  assert.ok(a.startsWith("backups/aithoughts-"));
});
