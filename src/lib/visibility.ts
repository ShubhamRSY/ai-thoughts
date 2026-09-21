import type { Db } from "mongodb";
import { blockedHandles, isBlockedPair } from "./blocks.ts";

export type Privacy = "public" | "private" | "locked";
export const PRIVACY_LEVELS: readonly Privacy[] = ["public", "private", "locked"];

export function parsePrivacy(v: unknown): Privacy {
  return v === "private" || v === "locked" ? v : "public";
}

export interface ViewerRelation {
  isSelf: boolean;
  isApprovedFollower: boolean;
}

export interface Visibility {
  posts: boolean;
  profile: boolean;
  lists: boolean;
  searchable: boolean;
}

export function decideVisibility(privacy: Privacy, rel: ViewerRelation): Visibility {
  const trusted = rel.isSelf || rel.isApprovedFollower;
  return {
    posts: privacy === "public" || trusted,
    profile: privacy !== "locked" || trusted,
    lists: privacy === "public" || trusted,
    searchable: privacy !== "locked" || trusted,
  };
}

export type FollowStatus = "approved" | "pending";

/** Status a brand-new follow row gets; `null` means the account rejects follows. */
export function followStatusFor(privacy: Privacy): FollowStatus | null {
  if (privacy === "locked") return null;
  return privacy === "private" ? "pending" : "approved";
}

/** What to do with pending requests when an account switches to `to`. */
export function pendingActionFor(to: Privacy): "approve" | "decline" | "none" {
  if (to === "public") return "approve";
  if (to === "locked") return "decline";
  return "none";
}

export function canBeReposted(privacy: Privacy): boolean {
  return privacy === "public";
}

// ---- DB wrappers -----------------------------------------------------------

const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");

export function handleVariants(h: string): string[] {
  const n = norm(h);
  return n ? Array.from(new Set([h, n, `@${n}`])) : [];
}

// Legacy follow rows have no status; only an explicit "pending" is restricted.
const APPROVED = { status: { $ne: "pending" } } as const;

export async function getPrivacy(db: Db, handle: string): Promise<Privacy> {
  const row = await db
    .collection("profiles")
    .findOne({ handle: { $in: handleVariants(handle) } }, { projection: { privacy: 1 } });
  return parsePrivacy(row?.privacy);
}

async function isApprovedFollower(db: Db, viewer: string, owner: string): Promise<boolean> {
  const n = await db.collection("follows").countDocuments(
    {
      follower: { $in: handleVariants(viewer) },
      following: { $in: handleVariants(owner) },
      ...APPROVED,
    },
    { limit: 1 }
  );
  return n > 0;
}

export async function getVisibility(
  db: Db,
  viewer: string | null,
  owner: string
): Promise<Visibility & { privacy: Privacy }> {
  const privacy = await getPrivacy(db, owner);
  const isSelf = !!viewer && norm(viewer) === norm(owner);
  // A block hides everything, either direction. To the blocked side the
  // blocker looks like a locked account.
  if (viewer && !isSelf && (await isBlockedPair(db, viewer, owner))) {
    return { posts: false, profile: false, lists: false, searchable: false, privacy };
  }
  const approved =
    privacy !== "public" && !isSelf && !!viewer && (await isApprovedFollower(db, viewer, owner));
  return { ...decideVisibility(privacy, { isSelf, isApprovedFollower: approved }), privacy };
}

export async function canViewPosts(db: Db, viewer: string | null, owner: string) {
  return (await getVisibility(db, viewer, owner)).posts;
}

/**
 * Whether `viewer` may see one specific post: an archived take is visible to its
 * author only; anything else follows the author's privacy and any block.
 */
export async function canViewPost(
  db: Db,
  viewer: string | null,
  post: Record<string, unknown>
): Promise<boolean> {
  const owner = String(post.handle ?? "");
  if (post.archived === true) return !!viewer && norm(viewer) === norm(owner);
  return canViewPosts(db, viewer, owner);
}

/** True only when the post exists and this viewer may not see it. */
export async function postHiddenFrom(
  db: Db,
  viewer: string | null,
  postId: string
): Promise<boolean> {
  const { ObjectId } = await import("mongodb");
  let _id: InstanceType<typeof ObjectId>;
  try {
    _id = new ObjectId(postId);
  } catch {
    return false;
  }
  const post = await db
    .collection("posts")
    .findOne({ _id }, { projection: { handle: 1, archived: 1 } });
  if (!post?.handle) return false;
  return !(await canViewPost(db, viewer, post));
}

/**
 * Handles (all stored variants) of restricted authors this viewer may not see.
 * ponytail: $nin list, fine for hundreds of restricted accounts; denormalise
 * privacy onto posts or use $lookup if that grows.
 */
export async function hiddenHandles(
  db: Db,
  viewer: string | null,
  levels: Privacy[] = ["private", "locked"],
  /** Pass an in-flight blockedHandles() to share that lookup instead of repeating it. */
  blockedIn?: string[] | Promise<string[]>
): Promise<string[]> {
  // Blocked users are hidden regardless of which privacy levels the caller asks about.
  const [blocked, restricted] = await Promise.all([
    blockedIn ?? blockedHandles(db, viewer),
    db
      .collection("profiles")
      .find({ privacy: { $in: levels } })
      .project({ handle: 1 })
      .toArray(),
  ]);
  if (!restricted.length) return blocked;
  const names = restricted.map((r) => norm(String(r.handle)));
  const visible = new Set<string>();
  if (viewer) {
    visible.add(norm(viewer));
    // Own query scoped to the restricted set: listFollowing() caps at 200 rows
    // and would silently drop access for someone who follows many accounts.
    const rows = await db
      .collection("follows")
      .find({
        follower: { $in: handleVariants(viewer) },
        following: { $in: names.flatMap((h) => [h, `@${h}`]) },
        ...APPROVED,
      })
      .project({ following: 1 })
      .toArray();
    for (const r of rows) visible.add(norm(String(r.following)));
  }
  return [...blocked, ...names.filter((h) => !visible.has(h)).flatMap((h) => [h, `@${h}`])];
}

export async function hiddenAuthorFilter(db: Db, viewer: string | null) {
  const hidden = await hiddenHandles(db, viewer);
  return hidden.length ? { handle: { $nin: hidden } } : {};
}
