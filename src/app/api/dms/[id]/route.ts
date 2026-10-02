import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { isBlockedPair } from "@/lib/blocks";
import { reportError } from "@/lib/report-error";
import {
  acceptConversation,
  getConversation,
  hideConversation,
  otherMember,
  readMessages,
  sendDm,
  usersById,
} from "@/lib/dms";
import { pushDm, screenDm, serializeDm } from "../guard";

type Params = { params: Promise<{ id: string }> };

/** GET /api/dms/[id]?since=<iso> — the thread (or only newer messages, for polling). Marks it read. */
export async function GET(request: NextRequest, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { id } = await params;
    const { db } = await connectToDatabase();
    const c = await getConversation(db, id, session.id);
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const other = (await usersById(db, [otherMember(c, session.id)])).get(otherMember(c, session.id));
    const blocked = !other || (await isBlockedPair(db, session.handle, other.handle));

    const sinceRaw = request.nextUrl.searchParams.get("since");
    const since = sinceRaw && !Number.isNaN(Date.parse(sinceRaw)) ? new Date(sinceRaw) : null;
    const messages = await readMessages(db, c, session.id, since);

    return NextResponse.json({
      id,
      other: other ? { handle: other.handle, displayName: other.displayName } : null,
      request: !c.accepted.includes(session.id),
      can_reply: !blocked,
      messages: messages.map((m) => serializeDm(m, session.id)),
    });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/dms/[id]" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/** POST /api/dms/[id] `{ body }` to reply, or `{ action: "accept" | "delete" }`. */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { id } = await params;
    const input = await request.json().catch(() => ({}));
    const { db } = await connectToDatabase();
    const c = await getConversation(db, id, session.id);
    if (!c) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (input.action === "accept") {
      await acceptConversation(db, c, session.id);
      return NextResponse.json({ ok: true });
    }
    if (input.action === "delete") {
      await hideConversation(db, c, session.id);
      return NextResponse.json({ ok: true });
    }

    const me = { id: session.id, handle: session.handle, displayName: session.displayName || session.handle };
    const other = (await usersById(db, [otherMember(c, me.id)])).get(otherMember(c, me.id));
    if (!other || (await isBlockedPair(db, me.handle, other.handle))) {
      return NextResponse.json({ error: "You can't message this account." }, { status: 403 });
    }
    const body = await screenDm(me.id, input.body);
    if (typeof body !== "string") return body;

    const sent = await sendDm(db, c, me.id, body);
    if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status });
    pushDm(db, { to: other, from: me, conversationId: id, body, request: !c.accepted.includes(other.id) });
    return NextResponse.json({ ok: true, message: serializeDm(sent.message, me.id) });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/dms/[id]" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
