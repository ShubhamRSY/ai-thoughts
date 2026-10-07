import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { FEELINGS } from "@/lib/feelings";
import { isValidMoodDay, setMood, weekMoods } from "@/lib/mood";
import { rateLimit } from "@/lib/rate-limit";

const FEELING_IDS = new Set<string>(FEELINGS.map((f) => f.id));

/** POST { feeling, day } — the daily tap. Signed-in only; guests are sent to sign-in by the UI. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  // Each mood row is a (handle, day) write; bound it so a loop can't grow the
  // moods collection on demand. The honest client posts far less than this.
  const { ok, retryInSec } = await rateLimit(`mood:${session.id}`, 30, 10 * 60_000);
  if (!ok) {
    return NextResponse.json(
      { error: "Too many mood taps — try again shortly", retry_in_sec: retryInSec },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const feelings = body.feelings ?? (body.feeling ? [body.feeling] : []);
  if (!Array.isArray(feelings) || feelings.length === 0 || feelings.some((f) => !FEELING_IDS.has(f))) {
    return NextResponse.json({ error: "Invalid feeling" }, { status: 400 });
  }
  if (!isValidMoodDay(body.day)) {
    return NextResponse.json({ error: "Invalid day" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  await setMood(db, session.handle, body.day, feelings, "tap");
  return NextResponse.json({ ok: true, week: await weekMoods(db, session.handle, body.day) });
}

/** GET ?day=YYYY-MM-DD — your last 7 days. */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const day = request.nextUrl.searchParams.get("day");
  if (!isValidMoodDay(day)) return NextResponse.json({ error: "Invalid day" }, { status: 400 });

  const { db } = await connectToDatabase();
  return NextResponse.json(
    { week: await weekMoods(db, session.handle, day) },
    { headers: { "Cache-Control": "no-store" } }
  );
}
