import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { FEELINGS } from "@/lib/feelings";
import { isValidMoodDay, setMood, weekMoods } from "@/lib/mood";

const FEELING_IDS = new Set<string>(FEELINGS.map((f) => f.id));

/** POST { feeling, day } — the daily tap. Signed-in only; guests are sent to sign-in by the UI. */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  if (typeof body.feeling !== "string" || !FEELING_IDS.has(body.feeling)) {
    return NextResponse.json({ error: "Invalid feeling" }, { status: 400 });
  }
  if (!isValidMoodDay(body.day)) {
    return NextResponse.json({ error: "Invalid day" }, { status: 400 });
  }

  const { db } = await connectToDatabase();
  await setMood(db, session.handle, body.day, body.feeling, "tap");
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
