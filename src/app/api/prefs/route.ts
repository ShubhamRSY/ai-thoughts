import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { getPrefs, upsertPrefs } from "@/lib/prefs";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { db } = await connectToDatabase();
    const prefs = await getPrefs(db, session.handle);
    return NextResponse.json({
      ...prefs,
      email: prefs.email || session.email,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const body = await request.json();
    const { db } = await connectToDatabase();
    const prefs = await upsertPrefs(db, session.handle, {
      email: session.email,
      email_digest: Boolean(body.email_digest),
      weekly_digest: body.weekly_digest === undefined ? true : Boolean(body.weekly_digest),
      push_enabled:
        body.push_enabled === undefined ? undefined : Boolean(body.push_enabled),
    });
    return NextResponse.json(prefs);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
