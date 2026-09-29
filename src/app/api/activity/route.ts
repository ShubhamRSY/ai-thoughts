import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { ObjectId } from "mongodb";

import { reportError } from "@/lib/report-error";
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

    // Also catch mismatched casing stored from older posts
    const extra =
      rows.length >= 40
        ? []
        : (
            await db
              .collection("notifications")
              .find({})
              .sort({ created_at: -1 })
              .limit(100)
              .toArray()
          ).filter((n) => normHandle(String(n.recipient_handle || "")) === normHandle(session.handle));

    const seen = new Set(rows.map((r) => r._id.toString()));
    const all = [...rows];
    for (const n of extra) {
      if (!seen.has(n._id.toString())) all.push(n);
    }
    all.sort((a, b) => {
      const at = a.created_at instanceof Date ? a.created_at.getTime() : 0;
      const bt = b.created_at instanceof Date ? b.created_at.getTime() : 0;
      return bt - at;
    });

    const items = all.slice(0, 40);
    const unread = items.filter((n) => !n.read).length;

    return NextResponse.json({
      unread,
      items: items.map((n) => ({
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

    const body = await request.json().catch(() => ({}));
    const { db } = await connectToDatabase();
    const me = normHandle(session.handle);
    const variants = handleVariants(session.handle);

    if (body.action === "read_all") {
      await db.collection("notifications").updateMany(
        { recipient_handle: { $in: variants }, read: false },
        { $set: { read: true } }
      );
      // Casing fallback
      const loose = await db
        .collection("notifications")
        .find({ read: false })
        .limit(100)
        .toArray();
      const ids = loose
        .filter((n) => normHandle(String(n.recipient_handle || "")) === me)
        .map((n) => n._id);
      if (ids.length) {
        await db
          .collection("notifications")
          .updateMany({ _id: { $in: ids } }, { $set: { read: true } });
      }
      return NextResponse.json({ ok: true });
    }

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
      await db.collection("notifications").updateOne({ _id: oid }, { $set: { read: true } });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/activity" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
