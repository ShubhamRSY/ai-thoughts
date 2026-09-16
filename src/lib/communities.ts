import type { Db } from "mongodb";
import { checkDignity } from "@/lib/dignity";

export type CommunityDoc = {
  slug: string;
  name: string;
  description: string;
  creator_handle: string;
  creator_author: string;
  member_handles: string[];
  created_at: Date;
  updated_at: Date;
};

export type CommunityMessage = {
  community_slug: string;
  handle: string;
  author: string;
  body: string;
  created_at: Date;
};

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function withAt(h: string) {
  const n = normHandle(h);
  return n ? `@${n}` : "";
}

/** slug: lowercase letters, numbers, hyphens */
export function normalizeCommunitySlug(raw: string): string | null {
  const s = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return s.length >= 2 ? s : null;
}

export function slugFromName(name: string): string | null {
  return normalizeCommunitySlug(name);
}

export async function listCommunities(
  db: Db,
  opts?: { limit?: number }
): Promise<CommunityDoc[]> {
  const limit = opts?.limit ?? 40;
  return db
    .collection<CommunityDoc>("communities")
    .find({})
    .sort({ updated_at: -1 })
    .limit(limit)
    .toArray();
}

export async function listMyCommunities(db: Db, handle: string): Promise<CommunityDoc[]> {
  const variants = [
    withAt(handle),
    normHandle(handle),
    `@${normHandle(handle)}`,
    handle,
  ];
  return db
    .collection<CommunityDoc>("communities")
    .find({ member_handles: { $in: variants } })
    .sort({ updated_at: -1 })
    .limit(50)
    .toArray();
}

export async function getCommunity(db: Db, slug: string): Promise<CommunityDoc | null> {
  const s = normalizeCommunitySlug(slug);
  if (!s) return null;
  return db.collection<CommunityDoc>("communities").findOne({ slug: s });
}

export async function createCommunity(
  db: Db,
  opts: {
    name: string;
    description?: string;
    creatorHandle: string;
    creatorAuthor: string;
    slug?: string;
  }
): Promise<{ ok: true; community: CommunityDoc } | { ok: false; error: string }> {
  const name = opts.name.trim().slice(0, 60);
  if (name.length < 2) return { ok: false, error: "Name is too short" };
  const dignity = checkDignity(`${name} ${opts.description || ""}`);
  if (!dignity.ok) return { ok: false, error: dignity.reason || "That name isn’t allowed" };

  const slug = opts.slug
    ? normalizeCommunitySlug(opts.slug)
    : slugFromName(name);
  if (!slug) return { ok: false, error: "Pick a simpler name or slug" };

  const existing = await db.collection("communities").findOne({ slug });
  if (existing) return { ok: false, error: "That page name is taken — try another" };

  const handle = withAt(opts.creatorHandle);
  const now = new Date();
  const community: CommunityDoc = {
    slug,
    name,
    description: (opts.description || "").trim().slice(0, 280),
    creator_handle: handle,
    creator_author: opts.creatorAuthor.trim().slice(0, 80) || handle,
    member_handles: [handle],
    created_at: now,
    updated_at: now,
  };
  await db.collection("communities").insertOne(community);
  return { ok: true, community };
}

export async function joinCommunity(
  db: Db,
  slug: string,
  handle: string
): Promise<{ ok: boolean; error?: string }> {
  const s = normalizeCommunitySlug(slug);
  if (!s) return { ok: false, error: "Invalid page" };
  const h = withAt(handle);
  if (!h) return { ok: false, error: "Sign in required" };

  const res = await db.collection("communities").updateOne(
    { slug: s },
    {
      $addToSet: { member_handles: h },
      $set: { updated_at: new Date() },
    }
  );
  if (res.matchedCount === 0) return { ok: false, error: "Page not found" };
  return { ok: true };
}

export async function leaveCommunity(db: Db, slug: string, handle: string): Promise<void> {
  const s = normalizeCommunitySlug(slug);
  if (!s) return;
  const variants = [withAt(handle), normHandle(handle), `@${normHandle(handle)}`, handle];
  await db.collection("communities").updateOne(
    { slug: s },
    {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      $pull: { member_handles: { $in: variants } } as any,
      $set: { updated_at: new Date() },
    }
  );
}

export function isMember(community: CommunityDoc, handle: string): boolean {
  const n = normHandle(handle);
  return community.member_handles.some((h) => normHandle(h) === n);
}

export async function listMessages(
  db: Db,
  slug: string,
  limit = 80
): Promise<CommunityMessage[]> {
  const s = normalizeCommunitySlug(slug);
  if (!s) return [];
  const rows = await db
    .collection<CommunityMessage>("community_messages")
    .find({ community_slug: s })
    .sort({ created_at: -1 })
    .limit(limit)
    .toArray();
  return rows.reverse();
}

export async function postMessage(
  db: Db,
  opts: {
    slug: string;
    handle: string;
    author: string;
    body: string;
  }
): Promise<{ ok: true; message: CommunityMessage } | { ok: false; error: string }> {
  const s = normalizeCommunitySlug(opts.slug);
  if (!s) return { ok: false, error: "Invalid page" };
  const community = await getCommunity(db, s);
  if (!community) return { ok: false, error: "Page not found" };
  if (!isMember(community, opts.handle)) {
    return { ok: false, error: "Join this page to post" };
  }
  const body = opts.body.trim().slice(0, 1000);
  if (!body) return { ok: false, error: "Write something first" };
  const dignity = checkDignity(body);
  if (!dignity.ok) return { ok: false, error: dignity.reason || "That message isn’t allowed" };

  const message: CommunityMessage = {
    community_slug: s,
    handle: withAt(opts.handle),
    author: opts.author.trim().slice(0, 80) || withAt(opts.handle),
    body,
    created_at: new Date(),
  };
  await db.collection("community_messages").insertOne(message);
  await db.collection("communities").updateOne(
    { slug: s },
    { $set: { updated_at: new Date() } }
  );
  return { ok: true, message };
}
