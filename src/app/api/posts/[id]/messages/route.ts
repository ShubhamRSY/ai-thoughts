import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { checkDignity } from "@/lib/dignity";
import { notifyPostOwner } from "@/lib/activity";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    const messages = await db
      .collection("messages")
      .find({ post_id: id })
      .sort({ created_at: 1 })
      .limit(80)
      .toArray();

    return NextResponse.json(
      messages.map((m) => ({
        id: m._id.toString(),
        post_id: m.post_id,
        handle: m.handle,
        author: m.author,
        body: m.body,
        created_at: m.created_at instanceof Date ? m.created_at.toISOString() : String(m.created_at),
      }))
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { id } = await params;
    const body = await request.json();
    const trimmed = (body.body ?? "").trim();
    if (!trimmed) return NextResponse.json({ error: "Empty message" }, { status: 400 });

    const dignity = checkDignity(trimmed);
    if (!dignity.ok) {
      return NextResponse.json({ error: dignity.reason }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const preview = trimmed.slice(0, 600);
    const result = await db.collection("messages").insertOne({
      post_id: id,
      handle: session.handle,
      author: session.displayName || session.handle,
      body: preview,
      created_at: new Date(),
    });

    await notifyPostOwner(db, {
      postId: id,
      actorHandle: session.handle,
      actorAuthor: session.displayName || session.handle,
      kind: "reply",
      preview,
    });

    return NextResponse.json({ ok: true, id: result.insertedId.toString() });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
