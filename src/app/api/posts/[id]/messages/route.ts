import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { checkDignity } from "@/lib/dignity";
import { notifyPostOwner, notifyMentions } from "@/lib/activity";
import { extractMentions, normHandle } from "@/lib/mentions";
import { ObjectId } from "mongodb";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { canViewPost, postHiddenFrom } from "@/lib/visibility";
import { blockedHandles } from "@/lib/blocks";

import { reportError } from "@/lib/report-error";
const IP_MESSAGE_LIMIT = 30;
const IP_MESSAGE_WINDOW_MS = 10 * 60_000;

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { db } = await connectToDatabase();
    const viewer = await getSession();
    if (await postHiddenFrom(db, viewer?.handle ?? null, id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    // Replies from anyone in a block relationship with the viewer, either direction.
    const blocked = new Set((await blockedHandles(db, viewer?.handle ?? null)).map(normHandle));
    const messages = await db
      .collection("messages")
      .find({ post_id: id })
      .sort({ created_at: 1 })
      .limit(80)
      .toArray();

    const visible = messages.filter((m) => !blocked.has(normHandle(String(m.handle ?? ""))));
    const commenterHandles = [...new Set(visible.map((m) => String(m.handle ?? "")))];
    const verifiedByHandle = new Map<string, boolean>();
    if (commenterHandles.length > 0) {
      const variants = commenterHandles.flatMap((h) => [h, `@${normHandle(h)}`]);
      const users = await db
        .collection<{ handle?: string; verified?: boolean }>("users")
        .find({ handle: { $in: variants } })
        .project({ handle: 1, verified: 1 })
        .toArray();
      for (const u of users) {
        if (u.verified && u.handle) verifiedByHandle.set(normHandle(String(u.handle)), true);
      }
    }

    return NextResponse.json(
      visible.map((m) => ({
        id: m._id.toString(),
        post_id: m.post_id,
        handle: m.handle,
        author: m.author,
        author_verified: verifiedByHandle.get(normHandle(String(m.handle ?? ""))) ?? false,
        body: m.body,
        created_at: m.created_at instanceof Date ? m.created_at.toISOString() : String(m.created_at),
      }))
    );
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/posts/[id]/messages" });
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

    const ip = clientIp(request);
    const { ok: ipOk } = await rateLimit(`message:${ip}`, IP_MESSAGE_LIMIT, IP_MESSAGE_WINDOW_MS);
    if (!ipOk) {
      return NextResponse.json({ error: "Too many replies — slow down" }, { status: 429 });
    }

    const { id } = await params;
    const body = await request.json();
    const trimmed = (body.body ?? "").trim();
    if (!trimmed) return NextResponse.json({ error: "Empty message" }, { status: 400 });

    const dignity = checkDignity(trimmed);
    if (!dignity.ok) {
      return NextResponse.json({ error: dignity.reason }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const post = await db.collection("posts").findOne(
      { _id: objectId },
      { projection: { handle: 1, archived: 1 } }
    );
    if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });
    if (!(await canViewPost(db, session.handle, post))) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const preview = trimmed.slice(0, 600);
    const result = await db.collection("messages").insertOne({
      post_id: id,
      handle: session.handle,
      author: session.displayName || session.handle,
      body: preview,
      created_at: new Date(),
    });

    const mentioned = extractMentions(preview);
    const postHandle = post.handle ? String(post.handle) : null;

    const ownerMentioned =
      Boolean(postHandle) &&
      mentioned.some((h) => normHandle(h) === normHandle(postHandle!));

    // If the author was @mentioned, prefer the mention notice over a plain reply.
    if (!ownerMentioned) {
      await notifyPostOwner(db, {
        postId: id,
        actorHandle: session.handle,
        actorAuthor: session.displayName || session.handle,
        kind: "reply",
        preview,
      });
    }

    await notifyMentions(db, {
      postId: id,
      actorHandle: session.handle,
      actorAuthor: session.displayName || session.handle,
      preview,
      mentioned,
      skipHandles: ownerMentioned || !postHandle ? [] : [postHandle],
    });

    return NextResponse.json({ ok: true, id: result.insertedId.toString() });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/posts/[id]/messages" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
