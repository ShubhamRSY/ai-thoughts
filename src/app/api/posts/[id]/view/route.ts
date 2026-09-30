import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { canViewPost } from "@/lib/visibility";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";

// Views write a deduped row per (post, viewer) — generous but bounded so a
// script can't churn rows into post_views faster than the TTL drains them.
const IP_VIEW_LIMIT = 300;
const IP_VIEW_WINDOW_MS = 10 * 60_000;

/**
 * POST /api/posts/[id]/view — record that the current viewer has seen this
 * take. Deduped per (post, viewer) for 30 days. Members only (L6): a guest id
 * was just a cookie the caller could drop, so one script could mint unlimited
 * "unique" views — and guests can't read takes anyway.
 * The client calls this once a card is at least half on screen.
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
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const ip = clientIp(request);
    const { ok: ipOk, retryInSec } = await rateLimit(
      `view:${ip}`,
      IP_VIEW_LIMIT,
      IP_VIEW_WINDOW_MS
    );
    if (!ipOk) {
      return NextResponse.json(
        { error: "Too many requests — slow down", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }
    const viewerKey = `user:${session.handle}`;

    const { db } = await connectToDatabase();
    const post = await db.collection("posts").findOne({ _id: objectId }, { projection: { handle: 1, archived: 1, view_count: 1 } });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canViewPost(db, session.handle, post))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const seen = await db.collection("post_views").updateOne(
      { post_id: id, viewer_key: viewerKey },
      { $setOnInsert: { post_id: id, viewer_key: viewerKey, created_at: new Date() } },
      { upsert: true }
    );
    // The count lives on the post; post_views rows are only the dedupe window
    // (TTL, see lib/indexes.ts), so a viewer counts again after it expires.
    let viewCount = typeof post.view_count === "number" ? post.view_count : 0;
    if (seen.upsertedCount === 1) {
      const updated = await db
        .collection("posts")
        .findOneAndUpdate(
          { _id: objectId },
          { $inc: { view_count: 1 } },
          { returnDocument: "after", projection: { view_count: 1 } }
        );
      viewCount = typeof updated?.view_count === "number" ? updated.view_count : viewCount + 1;
    }

    return NextResponse.json({ ok: true, view_count: viewCount });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/posts/[id]/view" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
