import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";

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

    const body = await request.json();
    if (typeof body.archived !== "boolean") {
      return NextResponse.json({ error: "archived must be true or false" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const post = await db
      .collection("posts")
      .findOne({ _id }, { projection: { user_id: 1, handle: 1 } });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const isAuthor =
      String(post.user_id ?? "") === session.id ||
      (!!post.handle && norm(String(post.handle)) === norm(session.handle));
    if (!isAuthor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    await db
      .collection("posts")
      .updateOne(
        { _id },
        body.archived
          ? { $set: { archived: true, archived_at: new Date() } }
          : { $unset: { archived: "", archived_at: "" } }
      );
    return NextResponse.json({ ok: true, archived: body.archived });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
