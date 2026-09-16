import { NextRequest, NextResponse } from "next/server";
import type { Db } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { followUser, listFollowers, listFollowing, unfollowUser } from "@/lib/follows";

async function resolveProfiles(db: Db, handles: string[]) {
  const unique = [...new Set(handles)];
  if (unique.length === 0) return [];
  const rows = await db
    .collection("profiles")
    .find({ handle: { $in: unique } })
    .toArray();
  const byHandle = new Map(rows.map((r) => [String(r.handle), r]));
  return unique.map((handle) => {
    const row = byHandle.get(handle);
    return {
      handle,
      author: row?.author ?? handle.replace(/^@/, ""),
      avatarUrl: row?.avatar_url ?? row?.avatarUrl ?? "",
    };
  });
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { db } = await connectToDatabase();
    const [following, followerHandles] = await Promise.all([
      listFollowing(db, session.handle),
      listFollowers(db, session.handle),
    ]);
    const [followingProfiles, followers] = await Promise.all([
      resolveProfiles(db, following),
      resolveProfiles(db, followerHandles),
    ]);
    return NextResponse.json({ following, followingProfiles, followers });
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
