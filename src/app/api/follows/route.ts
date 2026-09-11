import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { followUser, listFollowing, unfollowUser } from "@/lib/follows";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { db } = await connectToDatabase();
    const following = await listFollowing(db, session.handle);
    return NextResponse.json({ following });
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
    const handle = typeof body.handle === "string" ? body.handle : "";
    if (!handle) return NextResponse.json({ error: "handle required" }, { status: 400 });

    const { db } = await connectToDatabase();
    if (body.action === "unfollow") {
      await unfollowUser(db, session.handle, handle);
      return NextResponse.json({ ok: true, following: false });
    }

    const result = await followUser(db, session.handle, handle);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, following: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
