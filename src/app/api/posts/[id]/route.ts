import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { isKeeperUser } from "@/lib/admin";
import { canViewPost } from "@/lib/visibility";
import { blockedHandles } from "@/lib/blocks";
import { checkDignity } from "@/lib/dignity";
import { extractMentions } from "@/lib/mentions";
import { contentFingerprint } from "@/lib/anti-abuse";
import { reportError } from "@/lib/report-error";
import { signMediaUrl } from "@/lib/media-access";
import { deletePostCascade } from "@/lib/moderation";
import { flaggedBody, isFlaggedContent } from "@/lib/content-moderation";
import { rateLimit } from "@/lib/rate-limit";

function parseObjectId(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const objectId = parseObjectId(id);
    if (!objectId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const { db } = await connectToDatabase();
    const post = await db.collection("posts").findOne({ _id: objectId });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const session = await getSession();
    if (!(await canViewPost(db, session?.handle ?? null, post))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const reactions = await db
      .collection<{ reaction: string; handle?: string; created_at?: Date }>("reactions")
      .find({ post_id: id })
      .toArray();
    const reactMap: Record<string, number> = {};
    for (const r of reactions) reactMap[r.reaction] = (reactMap[r.reaction] ?? 0) + 1;

    const { LIKE_REACTION, buildLikedBy } = await import("@/lib/likes");
    const me = session?.handle?.trim().toLowerCase().replace(/^@/, "") ?? null;
    const nameByHandle = new Map<string, string>();
    const verifiedByHandle = new Map<string, boolean>();
    const handles = [
      ...new Set(
        reactions
          .map((r) => r.handle?.trim().toLowerCase().replace(/^@/, ""))
          .filter(Boolean) as string[]
      ),
    ];
    handles.push(normHandle(String(post.handle ?? "")));
    if (handles.length > 0) {
      const variants = [...new Set(handles)].flatMap((h) => [h, `@${h}`]);
      const users = await db
        .collection<{ handle?: string; displayName?: string; verified?: boolean }>("users")
        .find({ handle: { $in: variants } })
        .project({ handle: 1, displayName: 1, verified: 1 })
        .toArray();
      for (const u of users) {
        if (!u.handle) continue;
        const key = u.handle.trim().toLowerCase().replace(/^@/, "");
        if (u.displayName) nameByHandle.set(key, u.displayName);
        if (u.verified) verifiedByHandle.set(key, true);
      }
    }
    const heartRows = reactions.filter((r) => r.reaction === LIKE_REACTION);
    const blockedSet = new Set(
      (await blockedHandles(db, session?.handle ?? null)).map((h) => h.replace(/^@/, ""))
    );
    const likedBy = buildLikedBy(
      heartRows.filter(
        (r) => !blockedSet.has((r.handle ?? "").trim().toLowerCase().replace(/^@/, ""))
      ),
      nameByHandle,
      8
    );
    const unique = new Set(
      heartRows
        .map((r) => r.handle?.trim().toLowerCase().replace(/^@/, ""))
        .filter(Boolean) as string[]
    );
    const likedByMe = Boolean(
      me &&
        heartRows.some((r) => r.handle?.trim().toLowerCase().replace(/^@/, "") === me)
    );

    return NextResponse.json({
      id: post._id.toString(),
      handle: post.handle,
      author: nameByHandle.get(normHandle(String(post.handle ?? ""))) || post.author,
      author_verified:
        verifiedByHandle.get(normHandle(String(post.handle ?? ""))) ?? Boolean(post.author_verified),
      content: post.content,
      media_type: post.media_type,
      feeling: post.feeling ?? null,
      // Signed, expiring links: the raw private URL opens nothing.
      media_url: await signMediaUrl(post.media_url),
      media_duration: post.media_duration ?? null,
      stream_url: await signMediaUrl(post.stream_url),
      stream_ready: Boolean(post.stream_ready),
      tags: post.tags ?? [],
      language: post.language ?? null,
      language_label: post.language_label ?? null,
      integrity_hash: post.integrity_hash ?? null,
      integrity_verified: Boolean(post.integrity_verified),
      integrity_label: post.integrity_label ?? null,
      transcript: post.transcript ?? null,
      created_at: post.created_at instanceof Date ? post.created_at.toISOString() : String(post.created_at),
      reactions: Object.entries(reactMap).map(([type, count]) => ({ type, count })),
      liked_by: likedBy,
      like_count: unique.size,
      liked_by_me: likedByMe,
    });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/posts/[id]" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

/** By account id where the post has one; legacy posts fall back to the handle. */
function isAuthorOf(post: Record<string, unknown>, session: { id: string; handle: string }): boolean {
  if (typeof post.user_id === "string" && post.user_id) return post.user_id === session.id;
  return normHandle(String(post.handle || "")) === normHandle(session.handle);
}

const MAX_CONTENT_LENGTH = 500;

/**
 * PATCH /api/posts/[id] — edit the text of your own take. Media, feeling and
 * integrity claims can't be swapped afterward (a verified clip stays the clip
 * it was approved against); only the author may edit, and the usual limits
 * apply. Deleted/archived takes are not editable.
 */
export async function PATCH(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    // Per account: each edit is a moderation call, so edits can't be used to
    // probe the screening in bulk (M2).
    const { ok: withinLimit, retryInSec } = await rateLimit(`post-edit:${session.id}`, 30, 10 * 60_000);
    if (!withinLimit) {
      return NextResponse.json(
        { error: "Too many edits — try again shortly", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    const { id } = await params;
    const objectId = parseObjectId(id);
    if (!objectId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const { db } = await connectToDatabase();
    const post = await db.collection("posts").findOne({ _id: objectId });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!isAuthorOf(post, session)) {
      return NextResponse.json({ error: "Only the author can edit this take" }, { status: 403 });
    }
    if (post.archived === true) {
      return NextResponse.json({ error: "Archived takes can't be edited" }, { status: 400 });
    }

    const body = await _request.json().catch(() => null);
    const content =
      body && typeof body.content === "string" ? body.content.trim() : null;
    if (content === null || content.length === 0) {
      return NextResponse.json({ error: "Content can't be empty" }, { status: 400 });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Content must be ${MAX_CONTENT_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }
    const dignity = checkDignity(content);
    if (!dignity.ok) {
      return NextResponse.json({ error: dignity.reason }, { status: 400 });
    }
    // The same AI screening a new take gets — otherwise a take could pass it
    // and then be edited into what it would have blocked (M2).
    if (await isFlaggedContent({ text: content })) {
      return NextResponse.json(flaggedBody("edit"), { status: 400 });
    }

    // Re-resolve @mentions against real users (a handle could have been taken
    // or renamed since the original post).
    let mentionedHandles: string[] = [];
    const rawMentions = extractMentions(content);
    if (rawMentions.length) {
      const variants = rawMentions.flatMap((h) => [h, `@${h}`]);
      const matched = await db
        .collection("users")
        .find({ handle: { $in: variants } })
        .project({ handle: 1 })
        .toArray();
      const matchedSet = new Set(matched.map((u) => normHandle(String(u.handle))));
      mentionedHandles = rawMentions.filter((h) => matchedSet.has(h));
    }

    await db.collection("posts").updateOne(
      { _id: objectId },
      {
        $set: {
          content,
          mentioned_handles: mentionedHandles,
          content_fp: contentFingerprint(content),
          edited_at: new Date(),
        },
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/posts/[id]" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { id } = await params;
    const objectId = parseObjectId(id);
    if (!objectId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const { db } = await connectToDatabase();
    const post = await db.collection("posts").findOne({ _id: objectId });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isAuthor = isAuthorOf(post, session);
    const isKeeper = await isKeeperUser(session.id);
    if (!isAuthor && !isKeeper) {
      return NextResponse.json({ error: "Only the author can delete this take" }, { status: 403 });
    }

    // Same cascade as keeper removals: files, replies, inbox rows, and — for a
    // take reported for child safety — evidence preserved first.
    await deletePostCascade(db, objectId, session.handle);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/posts/[id]" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
