import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { muteUser, unmuteUser, listMuted } from "@/lib/mutes";
import { resolveProfiles } from "@/lib/follows";
import { reportError } from "@/lib/report-error";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { db } = await connectToDatabase();
    const muted = await resolveProfiles(db, await listMuted(db, session.handle));
    return NextResponse.json({ muted });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/mutes" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    // Per account, not per IP: a follow/spam bot rotating IPs is still capped.
    const { ok: withinLimit, retryInSec } = await rateLimit(`mute:${session.id}`, 60, 60 * 60_000);
    if (!withinLimit) {
      return NextResponse.json(
        { error: "Too many mutes — try again shortly", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    const body = await request.json();
    const handle = typeof body.handle === "string" ? body.handle.trim() : "";
    if (!handle || (body.action !== "mute" && body.action !== "unmute")) {
      return NextResponse.json({ error: "handle and a valid action are required" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    if (body.action === "unmute") {
      await unmuteUser(db, session.handle, handle);
      return NextResponse.json({ ok: true });
    }
    const result = await muteUser(db, session.handle, handle);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/mutes" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}