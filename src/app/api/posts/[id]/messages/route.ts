import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

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
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const trimmed = (body.body ?? "").trim();
    if (!trimmed) return NextResponse.json({ error: "Empty message" }, { status: 400 });

    const { db } = await connectToDatabase();
    const result = await db.collection("messages").insertOne({
      post_id: id,
      handle: body.handle ?? "you",
      author: body.author ?? "You",
      body: trimmed.slice(0, 600),
      created_at: new Date(),
    });

    return NextResponse.json({ ok: true, id: result.insertedId.toString() });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
