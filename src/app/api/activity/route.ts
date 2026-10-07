import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { ObjectId } from "mongodb";
import { reportError } from "@/lib/report-error";
import { rateLimit } from "@/lib/rate-limit";

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function handleVariants(h: string): string[] {
  const n = normHandle(h);
  return Array.from(new Set([h, `@${n}`, n, n.toLowerCase(), `@${n}`.toLowerCase()]));
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { db } = await connectToDatabase();
    const variants = handleVariants(session.handle);
    const rows = await db
      .collection("notifications")
      .find({ recipient_handle: { $in: variants } })
      .sort({ created_at: -1 })
      .limit(40)
      .toArray();

    const unread = rows.filter((n) => !n.read).length;

    return NextResponse.json({
      unread,
      items: rows.map((n) => ({
        id: n._id.toString(),
        kind: n.kind,
        actor_handle: n.actor_handle,
        actor_author: n.actor_author,
        post_id: n.post_id,
        preview: n.preview,
        read: Boolean(n.read),
        created_at:
          n.created_at instanceof Date ? n.created_at.toISOString() : String(n.created_at),
      })),
    });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/activity" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    // Per account: a scripted actor hammering "read all" (or marking rows read
    // one by one) is the only load this endpoint can be put under.
    const { ok, retryInSec } = await rateLimit(`activity:${session.id}`, 60, 5 * 60_000);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many requests — try again shortly", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const { db } = await connectToDatabase();
    const me = normHandle(session.handle);
    const variants = handleVariants(session.handle);

    if (body.action === "read_all") {
      await db.collection("notifications").updateMany(
        { recipient_handle: { $in: variants }, read: false },
        { $set: { read: true } }
      );
      return NextResponse.json({ ok: true });
    }

    if (body.action === "clear_all") {
      await db.collection("notifications").deleteMany({ recipient_handle: { $in: variants } });
      return NextResponse.json({ ok: true });
    }

    // { id } marks one read; { id, action: "clear" } removes it.
    if (typeof body.id === "string") {
      let oid: ObjectId;
      try {
        oid = new ObjectId(body.id);
      } catch {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
      }
      const row = await db.collection("notifications").findOne({ _id: oid });
      if (!row || normHandle(String(row.recipient_handle || "")) !== me) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      if (body.action === "clear") await db.collection("notifications").deleteOne({ _id: oid });
      else await db.collection("notifications").updateOne({ _id: oid }, { $set: { read: true } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/activity" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
