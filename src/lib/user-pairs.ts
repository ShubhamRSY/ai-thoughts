import { ObjectId, type Db } from "mongodb";

// Blocks and mutes are relationships between *accounts*. They used to store
// handles, so renaming either side silently dissolved them (a blocked
// harasser renamed and walked straight back in — SECURITY_AUDIT.md H2).
// Rows now store user ids: { <from>_id, <to>_id, created_at }. Callers still
// speak handles; this module resolves them to ids on the way in and back to
// *current* handles on the way out, so feed filters on posts.handle keep
// working after anyone renames.
//
// ponytail: legacy rows ({ <from>: "@h", <to>: "@h" }, no ids) are still
// honored by handle so a deploy before scripts/migrate-blocks-mutes-to-user-id.mjs
// never switches blocks off. Delete the LEGACY branches once that script
// reports no unlinked rows.

export interface PairSpec {
  collection: "blocks" | "mutes";
  from: "blocker" | "muter";
  to: "blocked" | "muted";
}

export const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
const at = (h: string) => `@${norm(h)}`;
const variants = (h: string) => {
  const n = norm(h);
  return n ? Array.from(new Set([h, n, `@${n}`])) : [];
};
const withAt = (hs: Iterable<string>) => [...new Set([...hs].map(norm).filter(Boolean))].flatMap((h) => [h, `@${h}`]);

const idField = (f: string) => `${f}_id`;
const legacy = (spec: PairSpec) => ({ [idField(spec.from)]: { $exists: false } });

/** The account currently holding `handle`. */
export async function userIdForHandle(db: Db, handle: string | null): Promise<string | null> {
  if (!handle || !norm(handle)) return null;
  const row = await db
    .collection("users")
    .findOne({ handle: { $in: variants(handle) } }, { projection: { _id: 1 } });
  return row ? row._id.toString() : null;
}

async function currentHandles(db: Db, ids: string[]): Promise<Map<string, string>> {
  const oids = [...new Set(ids)].filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  if (!oids.length) return new Map();
  const rows = await db
    .collection<{ handle?: string }>("users")
    .find({ _id: { $in: oids } })
    .project<{ _id: ObjectId; handle?: string }>({ handle: 1 })
    .toArray();
  return new Map(rows.filter((r) => r.handle).map((r) => [r._id.toString(), String(r.handle)]));
}

/** Filter for rows from `a` to `b` (and back, when `both`), id rows and legacy rows alike. */
function pairFilter(spec: PairSpec, a: { id: string | null; h: string }, b: { id: string | null; h: string }, both: boolean) {
  const F = idField(spec.from);
  const T = idField(spec.to);
  const or: Record<string, unknown>[] = [];
  const dirs = both ? [[a, b], [b, a]] : [[a, b]];
  for (const [x, y] of dirs) {
    if (x.id && y.id) or.push({ [F]: x.id, [T]: y.id });
    or.push({ ...legacy(spec), [spec.from]: at(x.h), [spec.to]: at(y.h) });
  }
  return { $or: or };
}

export async function pairExists(db: Db, spec: PairSpec, a: string, b: string, both: boolean): Promise<boolean> {
  const [ia, ib] = await Promise.all([userIdForHandle(db, a), userIdForHandle(db, b)]);
  const n = await db
    .collection(spec.collection)
    .countDocuments(pairFilter(spec, { id: ia, h: a }, { id: ib, h: b }, both), { limit: 1 });
  return n > 0;
}

/**
 * Current handles (both `h` and `@h`) on the other side of `viewer`'s rows.
 * direction "out": rows viewer created; "both": either side.
 */
export async function relatedHandles(
  db: Db,
  spec: PairSpec,
  viewer: string | null,
  direction: "out" | "both",
  limit = 0
): Promise<string[]> {
  if (!viewer) return [];
  const F = idField(spec.from);
  const T = idField(spec.to);
  const me = await userIdForHandle(db, viewer);
  const or: Record<string, unknown>[] = [{ ...legacy(spec), [spec.from]: at(viewer) }];
  if (me) or.push({ [F]: me });
  if (direction === "both") {
    or.push({ ...legacy(spec), [spec.to]: at(viewer) });
    if (me) or.push({ [T]: me });
  }
  let cursor = db.collection(spec.collection).find({ $or: or }).sort({ created_at: -1 });
  if (limit) cursor = cursor.limit(limit);
  const rows = await cursor.toArray();

  const isId = (r: Record<string, unknown>) => typeof r[F] === "string";
  const otherId = (r: Record<string, unknown>) => String(r[F] === me ? r[T] : r[F]);
  const otherLegacy = (r: Record<string, unknown>) =>
    String(norm(String(r[spec.from])) === norm(viewer) ? r[spec.to] : r[spec.from]);
  const byId = await currentHandles(db, rows.filter(isId).map(otherId));
  // Newest first, for listings; a deleted account simply drops out.
  const ordered = rows
    .map((r) => (isId(r) ? byId.get(otherId(r)) : otherLegacy(r)))
    .filter((h): h is string => Boolean(h));
  return withAt(ordered);
}

/** The target's account, or an error for the route to return. */
export async function addPair(
  db: Db,
  spec: PairSpec,
  fromHandle: string,
  toHandle: string
): Promise<{ ok: true; fromId: string; toId: string; toHandle: string } | { ok: false; error: string; status: number }> {
  if (!norm(toHandle)) return { ok: false, error: "Invalid handle", status: 400 };
  const [fromId, target] = await Promise.all([
    userIdForHandle(db, fromHandle),
    db.collection("users").findOne({ handle: { $in: variants(toHandle) } }, { projection: { handle: 1 } }),
  ]);
  if (!target) return { ok: false, error: "Not found", status: 404 };
  const toId = target._id.toString();
  if (!fromId) return { ok: false, error: "Sign in required", status: 401 };
  if (fromId === toId) return { ok: false, error: "Can't do that to yourself", status: 400 };

  const F = idField(spec.from);
  const T = idField(spec.to);
  const write = () =>
    db
      .collection(spec.collection)
      .updateOne({ [F]: fromId, [T]: toId }, { $setOnInsert: { created_at: new Date() } }, { upsert: true });
  try {
    await write();
  } catch (e) {
    // The pre-H2 unique index on the handle pair sees every id-only row as
    // (null, null). Swap it for the non-unique legacy index and retry once.
    if ((e as { code?: number }).code !== 11000 || !(e as { keyPattern?: object }).keyPattern?.hasOwnProperty(spec.from)) throw e;
    await replaceLegacyPairIndex(db, spec);
    await write();
  }
  return { ok: true, fromId, toId, toHandle: String(target.handle) };
}

export async function removePair(db: Db, spec: PairSpec, fromHandle: string, toHandle: string): Promise<void> {
  const [ia, ib] = await Promise.all([userIdForHandle(db, fromHandle), userIdForHandle(db, toHandle)]);
  await db
    .collection(spec.collection)
    .deleteMany(pairFilter(spec, { id: ia, h: fromHandle }, { id: ib, h: toHandle }, false));
}

/** Account deletion / export: every row this account is on either side of. */
export function rowsOfUserFilter(spec: PairSpec, userId: string, handles: string[], side: "from" | "both") {
  const or: Record<string, unknown>[] = [
    { [idField(spec.from)]: userId },
    { ...legacy(spec), [spec.from]: { $in: handles } },
  ];
  if (side === "both") {
    or.push({ [idField(spec.to)]: userId }, { ...legacy(spec), [spec.to]: { $in: handles } });
  }
  return { $or: or };
}

/** Export rows with the other side shown by its current handle. */
export async function exportRows(db: Db, spec: PairSpec, userId: string, handles: string[]) {
  const T = idField(spec.to);
  const rows = await db
    .collection(spec.collection)
    .find(rowsOfUserFilter(spec, userId, handles, "from"))
    .toArray();
  const byId = await currentHandles(db, rows.map((r) => String(r[T] ?? "")).filter(Boolean));
  return rows.map((r) => ({
    [spec.to]: typeof r[T] === "string" ? byId.get(r[T]) ?? "(deleted account)" : String(r[spec.to]),
    created_at: r.created_at,
  }));
}

/**
 * Pre-H2 indexes were unique on the handle pair, which rejects a second
 * id-only row. No new handle rows are written, so legacy lookups only need a
 * plain index. Idempotent; also run by scripts/migrate-blocks-mutes-to-user-id.mjs.
 */
export async function replaceLegacyPairIndex(db: Db, spec: PairSpec): Promise<void> {
  const coll = db.collection(spec.collection);
  const oldName = `${spec.collection}_pair_unique`;
  const existing = await coll.indexes().catch(() => []);
  if (existing.some((i) => i.name === oldName)) await coll.dropIndex(oldName).catch(() => {});
  await coll.createIndex({ [spec.from]: 1, [spec.to]: 1 }, { name: `${spec.collection}_pair_legacy` });
}

export async function ensurePairIndexes(db: Db, spec: PairSpec): Promise<void> {
  const F = idField(spec.from);
  const T = idField(spec.to);
  await replaceLegacyPairIndex(db, spec);
  const coll = db.collection(spec.collection);
  await coll.createIndex(
    { [F]: 1, [T]: 1 },
    { unique: true, partialFilterExpression: { [F]: { $type: "string" } }, name: `${spec.collection}_ids_unique` }
  );
  await coll.createIndex({ [T]: 1 }, { name: `${spec.collection}_${T}` });
}
