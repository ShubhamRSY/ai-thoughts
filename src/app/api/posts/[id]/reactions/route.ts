import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { notifyPostOwner } from "@/lib/activity";
import { BOOST_REACTION, shouldNotifyOwner } from "@/lib/likes";
import { canBeReposted, canViewPost, getPrivacy } from "@/lib/visibility";
import { rateLimit, clientIp } from "@/lib/rate-limit";

const IP_REACTION_LIMIT = 120;
const IP_REACTION_WINDOW_MS = 10 * 60_000;

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function handleVariants(h: string): string[] {
  const n = normHandle(h);
  if (!n) return [];
  return Array.from(new Set([h, `@${n}`, n, `@${n}`.toLowerCase(), n.toLowerCase()]));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const ip = clientIp(request);
    const { ok: ipOk } = await rateLimit(`reaction:${ip}`, IP_REACTION_LIMIT, IP_REACTION_WINDOW_MS);
    if (!ipOk) {
      return NextResponse.json({ error: "Too many reactions — slow down" }, { status: 429 });
    }

    const { id } = await params;
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const body = await request.json();
    const reaction = typeof body.reaction === "string" ? body.reaction.slice(0, 8) : "";
    if (!reaction) return NextResponse.json({ error: "Invalid reaction" }, { status: 400 });

    const { db } = await connectToDatabase();
    const post = await db.collection("posts").findOne({ _id: objectId });
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canViewPost(db, session.handle, post))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (reaction === BOOST_REACTION && !canBeReposted(await getPrivacy(db, String(post.handle)))) {
      return NextResponse.json({ error: "This take can't be reposted" }, { status: 403 });
    }

    const variants = handleVariants(session.handle);
    const storeHandle = session.handle.startsWith("@")
      ? `@${normHandle(session.handle)}`
      : `@${normHandle(session.handle)}`;

    const existing = await db.collection("reactions").findOne({
      post_id: id,
      handle: { $in: variants },
      reaction,
    });

    if (existing) {
      await db.collection("reactions").deleteMany({
        post_id: id,
        handle: { $in: variants },
        reaction,
      });
      return NextResponse.json({ ok: true, action: "removed" });
    }

    // Clean any legacy casing duplicates for this user+reaction, then insert one.
    await db.collection("reactions").deleteMany({
      post_id: id,
      handle: { $in: variants },
      reaction,
    });

    await db.collection("reactions").insertOne({
      post_id: id,
      handle: storeHandle,
      handle_norm: normHandle(session.handle),
      reaction,
      created_at: new Date(),
    });

    if (shouldNotifyOwner(reaction)) {
      await notifyPostOwner(db, {
        postId: id,
        actorHandle: storeHandle,
        actorAuthor: session.displayName || session.handle,
        kind: "reaction",
        preview: reaction,
      });
    }

    return NextResponse.json({ ok: true, action: "added" });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
