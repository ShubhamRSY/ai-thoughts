import type { AnyBulkWriteOperation, Db } from "mongodb";
import { decryptEmail, encryptEmail, isEncryptedEmail } from "@/lib/secure";

export interface UserPrefs {
  handle: string;
  /** Decrypted for callers; stored as emailEnc when possible. */
  email?: string;
  email_digest: boolean;
  weekly_digest: boolean;
  push_enabled: boolean;
  /** First-run guided onboarding — shown once for brand-new accounts. */
  onboarded: boolean;
  updated_at: Date;
}

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function resolveStoredEmail(row: {
  email?: unknown;
  emailEnc?: unknown;
} | null): string | undefined {
  if (!row) return undefined;
  const fromEnc = decryptEmail(
    typeof row.emailEnc === "string" ? row.emailEnc : null
  );
  if (fromEnc) return fromEnc;
  const fromLegacy = decryptEmail(typeof row.email === "string" ? row.email : null);
  return fromLegacy || undefined;
}

export async function getPrefs(db: Db, handle: string): Promise<UserPrefs> {
  const row = await db.collection("user_prefs").findOne({
    handle: { $in: [handle, `@${normHandle(handle)}`, normHandle(handle)] },
  });
  return {
    handle,
    email: resolveStoredEmail(row as { email?: unknown; emailEnc?: unknown } | null),
    email_digest: Boolean(row?.email_digest),
    weekly_digest: Boolean(row?.weekly_digest),
    push_enabled: Boolean(row?.push_enabled),
    // Legacy accounts have no row yet → treat as already onboarded so the
    // wizard only appears for new accounts (who get a row created at sign-in).
    onboarded: row?.onboarded !== undefined ? Boolean(row.onboarded) : true,
    updated_at: row?.updated_at instanceof Date ? row.updated_at : new Date(),
  };
}

export async function upsertPrefs(
  db: Db,
  handle: string,
  patch: Partial<Pick<UserPrefs, "email" | "email_digest" | "weekly_digest" | "push_enabled" | "onboarded">>
): Promise<UserPrefs> {
  const $set: Record<string, unknown> = {
    handle,
    updated_at: new Date(),
  };
  const $unset: Record<string, ""> = {};
  if (patch.email !== undefined) {
    if (patch.email) {
      $set.emailEnc = encryptEmail(patch.email);
      $unset.email = "";
    } else {
      $unset.email = "";
      $unset.emailEnc = "";
    }
  }
  if (patch.email_digest !== undefined) $set.email_digest = patch.email_digest;
  if (patch.weekly_digest !== undefined) $set.weekly_digest = patch.weekly_digest;
  if (patch.push_enabled !== undefined) $set.push_enabled = patch.push_enabled;
  if (patch.onboarded !== undefined) $set.onboarded = patch.onboarded;

  const $setOnInsert: Record<string, unknown> = {};
  if (patch.email_digest === undefined) $setOnInsert.email_digest = false;
  if (patch.weekly_digest === undefined) $setOnInsert.weekly_digest = false;
  if (patch.push_enabled === undefined) $setOnInsert.push_enabled = false;
  if (patch.onboarded === undefined) $setOnInsert.onboarded = false;

  await db.collection("user_prefs").updateOne(
    { handle },
    {
      $set,
      ...(Object.keys($unset).length ? { $unset } : {}),
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
    .find({
      [kind]: true,
      $or: [
        { emailEnc: { $exists: true, $ne: "" } },
        { email: { $exists: true, $ne: "" } },
      ],
    })
    .limit(500)
    .toArray();

  const out: { handle: string; email: string }[] = [];
  const migrate: AnyBulkWriteOperation[] = [];
  for (const r of rows) {
    const email = resolveStoredEmail(r as { email?: unknown; emailEnc?: unknown });
    if (!email || !email.includes("@")) continue;
    out.push({ handle: String(r.handle), email });
    // Migrate plaintext prefs on read (best-effort).
    if (
      typeof r.email === "string" &&
      r.email.includes("@") &&
      !isEncryptedEmail(r.emailEnc as string | undefined)
    ) {
      migrate.push({
        updateOne: { filter: { _id: r._id }, update: { $set: { emailEnc: encryptEmail(email) }, $unset: { email: "" } } },
      });
    }
  }
  if (migrate.length) {
    await db.collection("user_prefs").bulkWrite(migrate, { ordered: false }).catch((e) => console.warn("prefs email migration:", e));
  }
  return out;
}
