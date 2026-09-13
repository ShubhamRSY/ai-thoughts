import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getSession, isKeeperHandle } from "@/lib/auth";

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
    const reactions = await db
      .collection<{ reaction: string; handle?: string; created_at?: Date }>("reactions")
      .find({ post_id: id })
      .toArray();
    const reactMap: Record<string, number> = {};
    for (const r of reactions) reactMap[r.reaction] = (reactMap[r.reaction] ?? 0) + 1;

    const { LIKE_REACTION, buildLikedBy } = await import("@/lib/likes");
    const session = await getSession();
    const me = session?.handle?.trim().toLowerCase().replace(/^@/, "") ?? null;
    const nameByHandle = new Map<string, string>();
    const handles = [
      ...new Set(
        reactions
          .map((r) => r.handle?.trim().toLowerCase().replace(/^@/, ""))
          .filter(Boolean) as string[]
      ),
    ];
    if (handles.length > 0) {
      const variants = handles.flatMap((h) => [h, `@${h}`]);
      const users = await db
        .collection<{ handle?: string; displayName?: string }>("users")
        .find({ handle: { $in: variants } })
        .project({ handle: 1, displayName: 1 })
        .toArray();
      for (const u of users) {
        if (!u.handle) continue;
        const key = u.handle.trim().toLowerCase().replace(/^@/, "");
        if (u.displayName) nameByHandle.set(key, u.displayName);
      }
    }
    const heartRows = reactions.filter((r) => r.reaction === LIKE_REACTION);
    const likedBy = buildLikedBy(heartRows, nameByHandle, 8);
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
      author: post.author,
      content: post.content,
      media_type: post.media_type,
      feeling: post.feeling ?? null,
      media_url: post.media_url ?? null,
      media_duration: post.media_duration ?? null,
      stream_url: post.stream_url ?? null,
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
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
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

    const isAuthor = normHandle(String(post.handle || "")) === normHandle(session.handle);
    const isKeeper = await isKeeperHandle(session.handle);
    if (!isAuthor && !isKeeper) {
      return NextResponse.json({ error: "Only the author can delete this take" }, { status: 403 });
    }

    await db.collection("posts").deleteOne({ _id: objectId });
    await db.collection("messages").deleteMany({ post_id: id });
    await db.collection("reactions").deleteMany({ post_id: id });
    await db.collection("reports").deleteMany({ post_id: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
