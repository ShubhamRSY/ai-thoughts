import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { applyPrivacyTransition, listPendingRequests } from "@/lib/follows";
import { getPrivacy, PRIVACY_LEVELS, type Privacy } from "@/lib/visibility";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { db } = await connectToDatabase();
    const [privacy, pending] = await Promise.all([
      getPrivacy(db, session.handle),
      listPendingRequests(db, session.handle),
    ]);
    return NextResponse.json({ privacy, pending_count: pending.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const body = await request.json();
    if (!PRIVACY_LEVELS.includes(body.privacy)) {
      return NextResponse.json({ error: "Invalid privacy setting" }, { status: 400 });
    }
    const privacy = body.privacy as Privacy;

    const { db } = await connectToDatabase();
    await db.collection("profiles").updateOne(
      { handle: session.handle },
      {
        $set: { handle: session.handle, privacy, updated_at: new Date() },
        // A brand-new profile row still needs a display name for search/lists.
        $setOnInsert: { author: session.displayName },
      },
      { upsert: true }
    );
    await applyPrivacyTransition(db, session.handle, privacy);
    return NextResponse.json({ ok: true, privacy });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
