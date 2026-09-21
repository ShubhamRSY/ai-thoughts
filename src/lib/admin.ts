import { getSession } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function handleVariants(h: string): string[] {
  const n = normHandle(h);
  if (!n) return [];
  return Array.from(new Set([h, `@${n}`, n, `@${n}`.toLowerCase(), n.toLowerCase()]));
}

/** Comma/space-separated handles in env — always admins (bootstrap / break-glass). */
export function envAdminHandles(): string[] {
  const raw = process.env.ADMIN_HANDLES?.trim() || "";
  if (!raw) return [];
  return raw
    .split(/[,;\s]+/)
    .map((h) => normHandle(h))
    .filter(Boolean);
}

export async function isAdminHandle(handle: string): Promise<boolean> {
  if (!handle) return false;
  const key = normHandle(handle);
  if (!key) return false;

  if (envAdminHandles().includes(key)) return true;

  const { db } = await connectToDatabase();
  const admin = await db.collection("admins").findOne({
    handle: { $in: handleVariants(handle) },
  });
  return Boolean(admin);
}

/** Admins inherit keeper powers. */
export async function isAdminOrKeeperHandle(handle: string): Promise<boolean> {
  if (await isAdminHandle(handle)) return true;
  const { isKeeperHandle } = await import("@/lib/auth");
  return isKeeperHandle(handle);
}

export async function requireAdminSession() {
  const session = await getSession();
  if (!session) return { ok: false as const, status: 401 as const, error: "Sign in required" };
  if (!(await isAdminHandle(session.handle))) {
    return { ok: false as const, status: 403 as const, error: "Admin only" };
  }
  return { ok: true as const, session };
}

export async function listAdmins(): Promise<{ handle: string; source: "env" | "db" }[]> {
  const fromEnv = envAdminHandles().map((h) => ({ handle: `@${h}`, source: "env" as const }));
  const { db } = await connectToDatabase();
  const rows = await db
    .collection<{ handle: string }>("admins")
    .find({})
    .project({ handle: 1 })
    .limit(100)
    .toArray();
  const seen = new Set(fromEnv.map((a) => normHandle(a.handle)));
  const fromDb = rows
    .map((r) => ({
      handle: r.handle.startsWith("@") ? r.handle : `@${normHandle(r.handle)}`,
      source: "db" as const,
    }))
    .filter((a) => {
      const k = normHandle(a.handle);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return [...fromEnv, ...fromDb];
}

export async function listKeepers(): Promise<string[]> {
  const { db } = await connectToDatabase();
  const rows = await db
    .collection<{ handle: string }>("keepers")
    .find({})
    .project({ handle: 1 })
    .limit(200)
    .toArray();
  return rows.map((r) => (r.handle.startsWith("@") ? r.handle : `@${normHandle(r.handle)}`));
}

export async function addKeeper(handle: string): Promise<void> {
  const n = normHandle(handle);
  if (!n) throw new Error("Invalid handle");
  const { db } = await connectToDatabase();
  await db.collection("keepers").updateOne(
    { handle: { $in: handleVariants(handle) } },
    {
      $set: { handle: `@${n}`, updated_at: new Date() },
      $setOnInsert: { created_at: new Date() },
    },
    { upsert: true }
  );
}

export async function removeKeeper(handle: string): Promise<void> {
  const { db } = await connectToDatabase();
  await db.collection("keepers").deleteMany({ handle: { $in: handleVariants(handle) } });
}

export async function addAdmin(handle: string): Promise<void> {
  const n = normHandle(handle);
  if (!n) throw new Error("Invalid handle");
  const { db } = await connectToDatabase();
  await db.collection("admins").updateOne(
    { handle: { $in: handleVariants(handle) } },
    {
      $set: { handle: `@${n}`, updated_at: new Date() },
      $setOnInsert: { created_at: new Date() },
    },
    { upsert: true }
  );
  // Admins can moderate — ensure keeper row exists too.
  await addKeeper(`@${n}`);
}

export async function removeAdmin(handle: string): Promise<void> {
  const n = normHandle(handle);
  if (envAdminHandles().includes(n)) {
    throw new Error("Cannot remove an ADMIN_HANDLES env admin — change the env var instead");
  }
  const { db } = await connectToDatabase();
  await db.collection("admins").deleteMany({ handle: { $in: handleVariants(handle) } });
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
