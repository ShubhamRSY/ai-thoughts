import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    const post = await db.collection("posts").findOne({ _id: new ObjectId(id) });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const reactions = await db
      .collection("reactions")
      .find({ post_id: id })
      .toArray();
    const reactMap: Record<string, number> = {};
    for (const r of reactions) reactMap[r.reaction] = (reactMap[r.reaction] ?? 0) + 1;
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
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    await db.collection("posts").deleteOne({ _id: new ObjectId(id) });
    await db.collection("messages").deleteMany({ post_id: id });
    await db.collection("reactions").deleteMany({ post_id: id });
    await db.collection("reports").deleteMany({ post_id: id });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
