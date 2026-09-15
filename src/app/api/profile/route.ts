import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  createSession,
  getSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { checkDisplayNameAllowed } from "@/lib/anti-abuse";

export async function GET(request: NextRequest) {
  try {
    const handle = request.nextUrl.searchParams.get("handle");
    if (!handle) return NextResponse.json({ profile: null });
    const { db } = await connectToDatabase();
    const profile = await db.collection("profiles").findOne({ handle });
    return NextResponse.json({
      profile: profile
        ? {
            handle: profile.handle,
            author: profile.author,
            bio: profile.bio ?? "",
            avatarUrl: profile.avatar_url ?? profile.avatarUrl ?? "",
          }
        : null,
    });
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
    const handle = typeof body.handle === "string" ? body.handle : session.handle;
    if (handle !== session.handle) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const author =
      typeof body.author === "string" ? body.author.slice(0, 80) : session.displayName;
    const nameCheck = checkDisplayNameAllowed(author);
    if (!nameCheck.ok) {
      return NextResponse.json({ error: nameCheck.reason }, { status: 400 });
    }
    const bio = typeof body.bio === "string" ? body.bio.trim().slice(0, 160) : "";
    const avatarUrl =
      typeof body.avatarUrl === "string" && body.avatarUrl.startsWith("https://")
        ? body.avatarUrl.slice(0, 500)
        : "";

    const { db } = await connectToDatabase();
    await db.collection("profiles").updateOne(
      { handle },
      {
        $set: {
          handle,
          author,
          bio,
          avatar_url: avatarUrl || null,
          updated_at: new Date(),
        },
      },
      { upsert: true }
    );

    // Keep users, session, and existing takes in sync with the updated name.
    try {
      await db.collection("users").updateOne(
        { _id: new ObjectId(session.id) },
        { $set: { displayName: author } }
      );
      await db.collection("posts").updateMany(
        { user_id: session.id },
        { $set: { author } }
      );
    } catch {
      /* ignore */
    }

    const token = await createSession({
      id: session.id,
      handle: session.handle,
      displayName: author,
    });

    const res = NextResponse.json({
      ok: true,
      user: {
        id: session.id,
        handle: session.handle,
        displayName: author,
      },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
