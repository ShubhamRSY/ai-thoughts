import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { listMessages, postMessage } from "@/lib/communities";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { db } = await connectToDatabase();
    const messages = await listMessages(db, slug, 100);
    return NextResponse.json({
      messages: messages.map((m) => ({
        handle: m.handle,
        author: m.author,
        body: m.body,
        created_at:
          m.created_at instanceof Date ? m.created_at.toISOString() : String(m.created_at),
      })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const ip = clientIp(request);
    const { ok, retryInSec } = rateLimit(`community-msg:${ip}`, 40, 60_000);
    if (!ok) {
      return NextResponse.json(
        { error: "Slow down a bit", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    const { slug } = await params;
    const body = await request.json();
    const { db } = await connectToDatabase();
    const result = await postMessage(db, {
      slug,
      handle: session.handle,
      author: session.displayName || session.handle,
      body: typeof body.body === "string" ? body.body : "",
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      message: {
        handle: result.message.handle,
        author: result.message.author,
        body: result.message.body,
        created_at: result.message.created_at.toISOString(),
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
