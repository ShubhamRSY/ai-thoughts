import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import {
  followUser,
  getFollowState,
  listFollowers,
  listFollowing,
  resolveProfiles,
  resolveRequest,
  unfollowUser,
} from "@/lib/follows";
import { getVisibility } from "@/lib/visibility";
import { blockedByMe } from "@/lib/blocks";
import { isMuted } from "@/lib/mutes";

import { reportError } from "@/lib/report-error";
function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

export async function GET(request: NextRequest) {
  try {
    const targetParam = request.nextUrl.searchParams.get("handle")?.trim();
    const session = await getSession();
    const targetHandle = targetParam || session?.handle;
    if (!targetHandle) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { db } = await connectToDatabase();
    const viewer = session?.handle ?? null;
    const isSelf = !!viewer && normHandle(viewer) === normHandle(targetHandle);
    const followState =
      viewer && !isSelf ? await getFollowState(db, viewer, targetHandle) : undefined;

    // Only the blocker ever learns about a block; only the muter about a mute.
    const iBlocked = viewer && !isSelf ? await blockedByMe(db, viewer, targetHandle) : false;
    const mutedByMe = viewer && !isSelf ? await isMuted(db, viewer, targetHandle) : false;

    const vis = await getVisibility(db, viewer, targetHandle);
    if (!vis.lists) {
      return NextResponse.json({
        following: [],
        followingProfiles: [],
        followers: [],
        restricted: true,
        blockedByMe: iBlocked || undefined,
        mutedByMe: mutedByMe || undefined,
        followState,
        isFollowedByMe: false,
      });
    }

    const [following, followerHandles] = await Promise.all([
      listFollowing(db, targetHandle),
      listFollowers(db, targetHandle),
    ]);
    const [followingProfiles, followers] = await Promise.all([
      resolveProfiles(db, following),
      resolveProfiles(db, followerHandles),
    ]);
    return NextResponse.json({
      following,
      followingProfiles,
      followers,
      followState,
      blockedByMe: iBlocked || undefined,
      mutedByMe: mutedByMe || undefined,
      isFollowedByMe: followState === "following",
    });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/follows" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    // Per account, not per IP: a follow/spam bot rotating IPs is still capped.
    const { ok: withinLimit, retryInSec } = await rateLimit(`follow:${session.id}`, 60, 60 * 60_000);
    if (!withinLimit) {
      return NextResponse.json(
        { error: "Too many follows — try again shortly", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }
    const body = await request.json();
    const handle = typeof body.handle === "string" ? body.handle : "";
    if (!handle) return NextResponse.json({ error: "handle required" }, { status: 400 });

    const { db } = await connectToDatabase();
    if (body.action === "approve" || body.action === "decline") {
      const resolved = await resolveRequest(db, session.handle, handle, body.action);
      return NextResponse.json({ ok: true, resolved });
    }
    if (body.action === "unfollow") {
      await unfollowUser(db, session.handle, handle);
      return NextResponse.json({ ok: true, following: false });
    }

    const result = await followUser(db, session.handle, handle);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({
      ok: true,
      following: !result.pending,
      requested: !!result.pending,
    });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/follows" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
