import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { canViewPost } from "@/lib/visibility";

const ANON_ID_COOKIE = "aithoughts.anon";
const ANON_ID_MAX_AGE = 400 * 24 * 3600; // ~13 months, well past any session

/**
 * POST /api/posts/[id]/view — record that the current viewer has seen this
 * take. Deduped per (post, viewer): signed-in viewers key on their handle,
 * signed-out viewers key on an anonymous id set here on first view.
 *
 * ponytail: "seen" = the card mounted client-side, not that it actually
 * scrolled into the viewport. An IntersectionObserver would be the more
 * honest signal — upgrade to that if this number ever needs to resist
 * gaming (e.g. as a creator-facing metric with real stakes).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const session = await getSession();
    const existingAnonId = request.cookies.get(ANON_ID_COOKIE)?.value;
    const anonId = session ? null : (existingAnonId ?? randomUUID());
    const viewerKey = session ? `user:${session.handle}` : `anon:${anonId}`;

    const { db } = await connectToDatabase();
    const post = await db.collection("posts").findOne({ _id: objectId }, { projection: { handle: 1, archived: 1 } });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canViewPost(db, session?.handle ?? null, post))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.collection("post_views").updateOne(
      { post_id: id, viewer_key: viewerKey },
      { $setOnInsert: { post_id: id, viewer_key: viewerKey, created_at: new Date() } },
      { upsert: true }
    );

    const viewCount = await db.collection("post_views").countDocuments({ post_id: id });

    const res = NextResponse.json({ ok: true, view_count: viewCount });
    if (anonId && anonId !== existingAnonId) {
      res.cookies.set(ANON_ID_COOKIE, anonId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: ANON_ID_MAX_AGE,
      });
    }
    return res;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
