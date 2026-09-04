import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { FEELINGS } from "@/lib/feelings";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const MEDIA_TYPES = new Set(["audio", "video", "text"]);
const FEELING_IDS = new Set(FEELINGS.map((f) => f.id));
const MAX_CONTENT_LENGTH = 2800;
const COOLDOWN_MS = 15_000;
const IP_POST_LIMIT = 20;
const IP_POST_WINDOW_MS = 10 * 60_000;

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
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const ip = clientIp(request);
    const { ok: ipOk } = rateLimit(`post:${ip}`, IP_POST_LIMIT, IP_POST_WINDOW_MS);
    if (!ipOk) {
      return NextResponse.json({ error: "Too many posts — slow down" }, { status: 429 });
    }

    const body = await request.json();

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Content must be ${MAX_CONTENT_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }

    const mediaType = typeof body.media_type === "string" ? body.media_type : "text";
    if (!MEDIA_TYPES.has(mediaType)) {
      return NextResponse.json({ error: "Invalid media_type" }, { status: 400 });
    }

    const feeling =
      typeof body.feeling === "string" && FEELING_IDS.has(body.feeling as never)
        ? body.feeling
        : null;

    const { db } = await connectToDatabase();

    const lastPost = await db
      .collection<PostDoc>("posts")
      .find({ user_id: session.id })
      .sort({ created_at: -1 })
      .limit(1)
      .toArray();
    if (lastPost[0]) {
      const elapsed = Date.now() - new Date(lastPost[0].created_at).getTime();
      if (elapsed < COOLDOWN_MS) {
        return NextResponse.json(
          { error: "cooldown", retry_in_sec: Math.ceil((COOLDOWN_MS - elapsed) / 1000) },
          { status: 429 }
        );
      }
    }

    const doc: PostDoc = {
      user_id: session.id,
      handle: session.handle,
      author: session.displayName || session.handle,
      content,
      media_type: mediaType as PostDoc["media_type"],
      feeling,
      media_url: typeof body.media_url === "string" ? body.media_url : null,
      media_duration: typeof body.media_duration === "string" ? body.media_duration : null,
      stream_url: null,
      stream_ready: false,
      tags: Array.isArray(body.tags) ? body.tags.filter((t: unknown) => typeof t === "string").slice(0, 10) : [],
      language: typeof body.language === "string" ? body.language : null,
      language_label: typeof body.language_label === "string" ? body.language_label : null,
      integrity_hash: typeof body.integrity_hash === "string" ? body.integrity_hash : null,
      integrity_verified: Boolean(body.integrity_verified),
      integrity_label: typeof body.integrity_label === "string" ? body.integrity_label : null,
      transcript: null,
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
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
