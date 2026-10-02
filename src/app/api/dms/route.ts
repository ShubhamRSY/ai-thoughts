import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";
import { listInbox, openConversation, policyFor, sendDm, userByHandle } from "@/lib/dms";
import { pushDm, screenDm, serializeDm } from "./guard";

/** GET /api/dms — my inbox (main + requests) and unread counts. */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { db } = await connectToDatabase();
    const items = await listInbox(db, { id: session.id, handle: session.handle, displayName: session.displayName || session.handle });
    return NextResponse.json({
      items,
      unread: items.filter((i) => i.unread && !i.request).length,
      requests: items.filter((i) => i.request).length,
    });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/dms" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/** POST /api/dms `{ to: handle, body }` — message someone (starts the conversation if needed). */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const input = await request.json().catch(() => ({}));
    const to = typeof input.to === "string" ? input.to : "";

    const { db } = await connectToDatabase();
    const me = { id: session.id, handle: session.handle, displayName: session.displayName || session.handle };
    const other = to ? await userByHandle(db, to) : null;
    if (!other) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    if (other.id === me.id) return NextResponse.json({ error: "You can't message yourself" }, { status: 400 });

    const policy = await policyFor(db, me, other);
    if (!policy.allowed) return NextResponse.json({ error: policy.reason }, { status: 403 });

    const body = await screenDm(me.id, input.body);
    if (typeof body !== "string") return body;
    // Cold outreach is the spam vector: cap how many people one account can start talking to.
    const { ok } = await rateLimit(`dm-new:${me.id}`, 20, 60 * 60_000);
    if (!ok) return NextResponse.json({ error: "You've started a lot of conversations — try again later" }, { status: 429 });

    const conversation = await openConversation(db, me.id, other.id, policy.request);
    const sent = await sendDm(db, conversation, me.id, body);
    if (!sent.ok) return NextResponse.json({ error: sent.error }, { status: sent.status });

    const id = conversation._id.toString();
    pushDm(db, { to: other, from: me, conversationId: id, body, request: !conversation.accepted.includes(other.id) });
    return NextResponse.json({ ok: true, conversation_id: id, message: serializeDm(sent.message, me.id) });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/dms" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
