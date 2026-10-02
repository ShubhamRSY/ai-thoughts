import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { reportError } from "@/lib/report-error";

const norm = (h: string) => h.trim().toLowerCase().replace(/^@/, "");

/** POST /api/posts/[id]/archive `{ archived: boolean }` — author only. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { id } = await params;
    let _id: ObjectId;
    try {
      _id = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    if (typeof body.archived !== "boolean") {
      return NextResponse.json({ error: "archived must be true or false" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const post = await db
      .collection("posts")
      .findOne({ _id }, { projection: { user_id: 1, handle: 1, moderation_hold: 1 } });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isAuthor =
      String(post.user_id ?? "") === session.id ||
      (!!post.handle && norm(String(post.handle)) === norm(session.handle));
    if (!isAuthor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (!body.archived && post.moderation_hold === true) {
      return NextResponse.json(
        { error: "This take is hidden while a keeper reviews it", code: "moderation_hold" },
        { status: 403 }
      );
    }

    // Re-check the hold in the write itself: a hold set after the read above
    // must still win over an unhide.
    const res = await db
      .collection("posts")
      .updateOne(
        { _id, ...(body.archived ? {} : { moderation_hold: { $ne: true } }) },
        body.archived
          ? { $set: { archived: true, archived_at: new Date() } }
          : { $unset: { archived: "", archived_at: "" } }
      );
    if (res.matchedCount === 0) {
      return NextResponse.json(
        { error: "This take is hidden while a keeper reviews it", code: "moderation_hold" },
        { status: 403 }
      );
    }
    return NextResponse.json({ ok: true, archived: body.archived });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/posts/[id]/archive" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
