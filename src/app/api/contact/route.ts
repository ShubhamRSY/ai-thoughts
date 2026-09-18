import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { getSession, isKeeperHandle } from "@/lib/auth";
import { CONTACT_EMAIL } from "@/lib/site";

const CONTACT_LIMIT = 5;
const CONTACT_WINDOW_MS = 60 * 60_000;

export async function GET() {
  try {
    const session = await getSession();
    if (!session || !(await isKeeperHandle(session.handle))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    const rows = await db
      .collection("contact_requests")
      .find({ status: "open" })
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    return NextResponse.json({
      requests: rows.map((r) => ({
        id: r._id.toString(),
        email: r.email,
        message: r.message,
        kind: r.kind,
        createdAt: r.createdAt,
      })),
    });
  } catch (e) {
    console.error("contact list error:", e);
    return NextResponse.json({ error: "Failed to load" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await getSession();
    if (!session || !(await isKeeperHandle(session.handle))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const { id } = body as { id?: string };
    if (!id || !ObjectId.isValid(id)) {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    await db.collection("contact_requests").updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "resolved", resolvedAt: new Date().toISOString() } }
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("contact resolve error:", e);
    return NextResponse.json({ error: "Failed to resolve" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const { ok, retryInSec } = await rateLimit(`contact:${ip}`, CONTACT_LIMIT, CONTACT_WINDOW_MS);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many messages — try again later", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { email, message, kind } = body as {
      email?: string;
      message?: string;
      kind?: string;
    };

    if (!email || typeof email !== "string" || email.length > 254) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }
    if (message.length > 4000) {
      return NextResponse.json({ error: "Message is too long" }, { status: 400 });
    }

    const allowedKinds = new Set(["privacy", "removal", "general"]);
    const requestKind = allowedKinds.has(kind ?? "") ? kind : "general";

    const { db } = await connectToDatabase();
    await db.collection("contact_requests").insertOne({
      email: email.toLowerCase().trim(),
      message: message.trim(),
      kind: requestKind,
      status: "open",
      createdAt: new Date().toISOString(),
      ip,
    });

    return NextResponse.json({
      ok: true,
      message: `Received — keepers will follow up. You can also email ${CONTACT_EMAIL}.`,
    });
  } catch (e) {
    console.error("contact error:", e);
    return NextResponse.json({ error: "Could not send message" }, { status: 500 });
  }
}
