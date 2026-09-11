import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { notifyPostOwner } from "@/lib/activity";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const reaction = typeof body.reaction === "string" ? body.reaction.slice(0, 8) : "";
    if (!reaction) return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });

    const { db } = await connectToDatabase();

    const existing = await db.collection("reactions").findOne({
      post_id: id,
      handle: session.handle,
      reaction,
    });

    if (existing) {
      await db.collection("reactions").deleteOne({ _id: existing._id });
      return NextResponse.json({ ok: true, action: "removed" });
    }

    await db.collection("reactions").insertOne({
      post_id: id,
      handle: session.handle,
      reaction,
      created_at: new Date(),
    });

    await notifyPostOwner(db, {
      postId: id,
      actorHandle: session.handle,
      actorAuthor: session.displayName || session.handle,
      kind: "reaction",
      preview: reaction,
    });

    return NextResponse.json({ ok: true, action: "added" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
