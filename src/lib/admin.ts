import { ObjectId, type Db } from "mongodb";
import { getSession } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { parseAdminUserIds } from "@/lib/env";

// Roles belong to an account (users._id), never to a handle: handles can be
// renamed away and registered by someone else, who must not inherit powers.
// Rows are { user_id, handle (label at grant time), created_at }. Legacy rows
// without user_id grant nothing until scripts/migrate-roles-to-user-id.mjs
// links them to their account.

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function handleVariants(h: string): string[] {
  const n = normHandle(h);
  if (!n) return [];
  return Array.from(new Set([h, `@${n}`, n, `@${n}`.toLowerCase(), n.toLowerCase()]));
}

/** Break-glass admins from the ADMIN_USER_IDS env var. */
export function envAdminUserIds(): string[] {
  return parseAdminUserIds(process.env.ADMIN_USER_IDS);
}

/** The account currently holding `handle`, resolved at grant/revoke time. */
export async function resolveUserByHandle(
  db: Db,
  handle: string
): Promise<{ id: string; handle: string } | null> {
  if (!normHandle(handle)) return null;
  const row = await db
    .collection<{ handle: string }>("users")
    .findOne({ handle: { $in: handleVariants(handle) } }, { projection: { handle: 1 } });
  return row ? { id: row._id.toString(), handle: row.handle } : null;
}

async function requireUser(db: Db, handle: string) {
  const user = await resolveUserByHandle(db, handle);
  if (!user) throw new Error(`No registered account matches @${normHandle(handle)}`);
  return user;
}

export async function isAdminUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  if (envAdminUserIds().includes(userId.toLowerCase())) return true;
  const { db } = await connectToDatabase();
  return Boolean(await db.collection("admins").findOne({ user_id: userId }, { projection: { _id: 1 } }));
}

/** Admins inherit keeper (moderation) powers. */
export async function isKeeperUser(userId: string): Promise<boolean> {
  if (!userId) return false;
  if (await isAdminUser(userId)) return true;
  const { db } = await connectToDatabase();
  return Boolean(await db.collection("keepers").findOne({ user_id: userId }, { projection: { _id: 1 } }));
}

export async function requireAdminSession() {
  const session = await getSession();
  if (!session) return { ok: false as const, status: 401 as const, error: "Sign in required" };
  if (!(await isAdminUser(session.id))) {
    return { ok: false as const, status: 403 as const, error: "Admin only" };
  }
  return { ok: true as const, session };
}

/** Current handles for role rows (a renamed keeper shows under their new name). */
async function currentHandles(db: Db, userIds: string[]): Promise<Map<string, string>> {
  const ids = userIds.filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const rows = ids.length
    ? await db
        .collection<{ handle: string }>("users")
        .find({ _id: { $in: ids } })
        .project<{ _id: ObjectId; handle: string }>({ handle: 1 })
        .toArray()
    : [];
  return new Map(rows.map((r) => [r._id.toString(), r.handle]));
}

export async function listAdmins(): Promise<{ handle: string; source: "env" | "db" }[]> {
  const { db } = await connectToDatabase();
  const envIds = envAdminUserIds();
  const rows = await db
    .collection<{ user_id: string }>("admins")
    .find({ user_id: { $type: "string" } })
    .project<{ user_id: string }>({ user_id: 1 })
    .limit(100)
    .toArray();
  const handles = await currentHandles(db, [...envIds, ...rows.map((r) => r.user_id)]);
  const seen = new Set<string>();
  const out: { handle: string; source: "env" | "db" }[] = [];
  for (const [id, source] of [
    ...envIds.map((id) => [id, "env"] as const),
    ...rows.map((r) => [r.user_id, "db"] as const),
  ]) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ handle: handles.get(id) ?? `(no account ${id})`, source });
  }
  return out;
}

export async function listKeepers(): Promise<string[]> {
  const { db } = await connectToDatabase();
  const rows = await db
    .collection<{ user_id: string }>("keepers")
    .find({ user_id: { $type: "string" } })
    .project<{ user_id: string }>({ user_id: 1 })
    .limit(200)
    .toArray();
  const handles = await currentHandles(db, rows.map((r) => r.user_id));
  return rows.map((r) => handles.get(r.user_id)).filter((h): h is string => Boolean(h));
}

async function grant(db: Db, collection: "keepers" | "admins", user: { id: string; handle: string }) {
  await db.collection(collection).updateOne(
    { user_id: user.id },
    {
      $set: { user_id: user.id, handle: user.handle, updated_at: new Date() },
      $setOnInsert: { created_at: new Date() },
    },
    { upsert: true }
  );
}

/** Revokes by account, plus any unlinked legacy row still naming this handle. */
async function revoke(db: Db, collection: "keepers" | "admins", handle: string) {
  const user = await resolveUserByHandle(db, handle);
  await db.collection(collection).deleteMany({
    $or: [
      ...(user ? [{ user_id: user.id }] : []),
      { user_id: { $exists: false }, handle: { $in: handleVariants(handle) } },
    ],
  });
}

export async function addKeeper(handle: string): Promise<void> {
  const { db } = await connectToDatabase();
  await grant(db, "keepers", await requireUser(db, handle));
}

export async function removeKeeper(handle: string): Promise<void> {
  const { db } = await connectToDatabase();
  await revoke(db, "keepers", handle);
}

/** Grant/revoke the verified checkmark for a registered account. */
export async function setUserVerified(handle: string, verified: boolean): Promise<void> {
  const { db } = await connectToDatabase();
  const user = await requireUser(db, handle);
  await db
    .collection("users")
    .updateOne({ _id: new ObjectId(user.id) }, { $set: { verified, verified_updated_at: new Date() } });
}

export async function addAdmin(handle: string): Promise<{ id: string; handle: string }> {
  const { db } = await connectToDatabase();
  const user = await requireUser(db, handle);
  await grant(db, "admins", user);
  // Admins can moderate — ensure keeper row exists too.
  await grant(db, "keepers", user);
  return user;
}

export async function removeAdmin(handle: string): Promise<void> {
  const { db } = await connectToDatabase();
  const user = await resolveUserByHandle(db, handle);
  if (user && envAdminUserIds().includes(user.id)) {
    throw new Error("Cannot remove an ADMIN_USER_IDS env admin — change the env var instead");
  }
  await revoke(db, "admins", handle);
}

/** Account deletion: the account's roles go with it. */
export async function deleteRolesForUser(db: Db, userId: string): Promise<void> {
  await Promise.all([
    db.collection("keepers").deleteMany({ user_id: userId }),
    db.collection("admins").deleteMany({ user_id: userId }),
  ]);
}

export type SiteSettings = {
  maintenance: boolean;
  maintenanceMessage: string;
  invitesOpen: boolean;
  /** Post id a human picked to sit at the top of Voices. "" = none. */
  featuredPostId: string;
};

const DEFAULT_SETTINGS: SiteSettings = {
  maintenance: false,
  maintenanceMessage: "Voices is pausing briefly — check back soon.",
  invitesOpen: true,
  featuredPostId: "",
};

export async function getSiteSettings(): Promise<SiteSettings> {
  const { db } = await connectToDatabase();
  const row = await db.collection("site_settings").findOne({ key: "global" });
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    maintenance: Boolean(row.maintenance),
    maintenanceMessage:
      typeof row.maintenanceMessage === "string" && row.maintenanceMessage.trim()
        ? row.maintenanceMessage.trim().slice(0, 280)
        : DEFAULT_SETTINGS.maintenanceMessage,
    invitesOpen: row.invitesOpen !== false,
    featuredPostId: typeof row.featuredPostId === "string" ? row.featuredPostId : "",
  };
}

export async function setSiteSettings(patch: Partial<SiteSettings>): Promise<SiteSettings> {
  const current = await getSiteSettings();
  const next: SiteSettings = {
    maintenance: patch.maintenance ?? current.maintenance,
    maintenanceMessage:
      typeof patch.maintenanceMessage === "string"
        ? patch.maintenanceMessage.trim().slice(0, 280) || current.maintenanceMessage
        : current.maintenanceMessage,
    invitesOpen: patch.invitesOpen ?? current.invitesOpen,
    featuredPostId:
      typeof patch.featuredPostId === "string" ? patch.featuredPostId.trim() : current.featuredPostId,
  };
  const { db } = await connectToDatabase();
  await db.collection("site_settings").updateOne(
    { key: "global" },
    { $set: { ...next, key: "global", updated_at: new Date() } },
    { upsert: true }
  );
  return next;
}
