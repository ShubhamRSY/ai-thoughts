import type { Db } from "mongodb";

export interface UserPrefs {
  handle: string;
  email?: string;
  email_digest: boolean;
  weekly_digest: boolean;
  push_enabled: boolean;
  updated_at: Date;
}

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

export async function getPrefs(db: Db, handle: string): Promise<UserPrefs> {
  const row = await db.collection("user_prefs").findOne({
    handle: { $in: [handle, `@${normHandle(handle)}`, normHandle(handle)] },
  });
  return {
    handle,
    email: row?.email,
    email_digest: Boolean(row?.email_digest),
    weekly_digest: Boolean(row?.weekly_digest),
    push_enabled: Boolean(row?.push_enabled),
    updated_at: row?.updated_at instanceof Date ? row.updated_at : new Date(),
  };
}

export async function upsertPrefs(
  db: Db,
  handle: string,
  patch: Partial<Pick<UserPrefs, "email" | "email_digest" | "weekly_digest" | "push_enabled">>
): Promise<UserPrefs> {
  const $set: Record<string, unknown> = {
    handle,
    updated_at: new Date(),
  };
  if (patch.email !== undefined) $set.email = patch.email;
  if (patch.email_digest !== undefined) $set.email_digest = patch.email_digest;
  if (patch.weekly_digest !== undefined) $set.weekly_digest = patch.weekly_digest;
  if (patch.push_enabled !== undefined) $set.push_enabled = patch.push_enabled;

  const $setOnInsert: Record<string, unknown> = {};
  if (patch.email_digest === undefined) $setOnInsert.email_digest = false;
  if (patch.weekly_digest === undefined) $setOnInsert.weekly_digest = false;
  if (patch.push_enabled === undefined) $setOnInsert.push_enabled = false;

  await db.collection("user_prefs").updateOne(
    { handle },
    {
      $set,
      ...(Object.keys($setOnInsert).length ? { $setOnInsert } : {}),
    },
    { upsert: true }
  );
  return getPrefs(db, handle);
}

export async function listDigestRecipients(
  db: Db,
  kind: "email_digest" | "weekly_digest"
): Promise<{ handle: string; email: string }[]> {
  const rows = await db
    .collection("user_prefs")
    .find({ [kind]: true, email: { $exists: true, $ne: "" } })
    .limit(500)
    .toArray();
  return rows
    .filter((r) => typeof r.email === "string" && r.email.includes("@"))
    .map((r) => ({ handle: String(r.handle), email: String(r.email) }));
}
