import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

interface PostDoc {
  _id?: ObjectId;
  user_id?: string;
  handle: string;
  author: string;
  content: string;
  media_type: "audio" | "video" | "text";
  feeling?: string | null;
  media_url?: string | null;
  media_duration?: string | null;
  stream_url?: string | null;
  stream_ready?: boolean;
  tags: string[];
  language?: string | null;
  language_label?: string | null;
  integrity_hash?: string | null;
  integrity_verified?: boolean | null;
  integrity_label?: string | null;
  transcript?: unknown;
  boosts?: number;
  created_at: Date;
}

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const posts = await db
      .collection<PostDoc>("posts")
      .find({})
      .sort({ created_at: -1 })
      .limit(40)
      .toArray();

    const postIds = posts.map((p) => p._id?.toString() ?? "");
    const reactions = await db
      .collection<{ post_id: string; reaction: string }>("reactions")
      .find({ post_id: { $in: postIds } })
      .toArray();

    const reactMap: Record<string, Record<string, number>> = {};
    for (const r of reactions) {
      if (!reactMap[r.post_id]) reactMap[r.post_id] = {};
      reactMap[r.post_id][r.reaction] = (reactMap[r.post_id][r.reaction] ?? 0) + 1;
    }

    const result = posts.map((p) => {
      const id = p._id?.toString() ?? "";
      const reacts = reactMap[id] ?? {};
      return {
        id,
        handle: p.handle,
        author: p.author || p.handle.replace(/^@/, ""),
        content: p.content,
        media_type: p.media_type,
        feeling: p.feeling ?? null,
        media_url: p.media_url ?? null,
        media_duration: p.media_duration ?? null,
        stream_url: p.stream_url ?? null,
        stream_ready: Boolean(p.stream_ready),
        tags: p.tags ?? [],
        language: p.language ?? null,
        language_label: p.language_label ?? null,
        integrity_hash: p.integrity_hash ?? null,
        integrity_verified: Boolean(p.integrity_verified),
        integrity_label: p.integrity_label ?? null,
        transcript: p.transcript ?? null,
        created_at: p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at),
        reactions: Object.entries(reacts).map(([type, count]) => ({ type, count })),
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { db } = await connectToDatabase();

    const doc: PostDoc = {
      handle: body.handle ?? "",
      author: body.author ?? "",
      content: body.content ?? "",
      media_type: body.media_type ?? "text",
      feeling: body.feeling ?? null,
      media_url: body.media_url ?? null,
      media_duration: body.media_duration ?? null,
      stream_url: body.stream_url ?? null,
      stream_ready: Boolean(body.stream_ready),
      tags: body.tags ?? [],
      language: body.language ?? null,
      language_label: body.language_label ?? null,
      integrity_hash: body.integrity_hash ?? null,
      integrity_verified: Boolean(body.integrity_verified),
      integrity_label: body.integrity_label ?? null,
      transcript: body.transcript ?? null,
      boosts: 0,
      created_at: new Date(),
    };

    const result = await db.collection<PostDoc>("posts").insertOne(doc);

    return NextResponse.json({
      id: result.insertedId.toString(),
      ...doc,
      created_at: doc.created_at.toISOString(),
      reactions: [],
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
