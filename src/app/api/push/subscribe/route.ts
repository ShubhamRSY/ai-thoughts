import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { removePushSubscription, savePushSubscription } from "@/lib/push";
import { upsertPrefs } from "@/lib/prefs";

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const body = await request.json();
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const p256dh = body.keys?.p256dh;
    const auth = body.keys?.auth;
    if (!endpoint || typeof p256dh !== "string" || typeof auth !== "string") {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    await savePushSubscription(db, session.handle, {
      endpoint,
      keys: { p256dh, auth },
    });
    await upsertPrefs(db, session.handle, {
      push_enabled: true,
      email: session.email,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const { db } = await connectToDatabase();
    // Only remove the caller's own subscription, never someone else's by
    // guessing their (non-secret) endpoint URL.
    if (endpoint) await removePushSubscription(db, endpoint, session.handle);
    await upsertPrefs(db, session.handle, { push_enabled: false, email: session.email });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
