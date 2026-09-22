import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  createSession,
  getSession,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "@/lib/auth";
import { checkDisplayNameAllowed, checkHandleAllowed } from "@/lib/anti-abuse";
import { getVisibility } from "@/lib/visibility";
import { upsertPrefs } from "@/lib/prefs";
import { decryptEmail } from "@/lib/secure";

export async function GET(request: NextRequest) {
  try {
    const handle = request.nextUrl.searchParams.get("handle");
    if (!handle) return NextResponse.json({ profile: null });
    const { db } = await connectToDatabase();
    const session = await getSession();
    const vis = await getVisibility(db, session?.handle ?? null, handle);
    if (!vis.profile) return NextResponse.json({ profile: null });
    const profile = await db.collection("profiles").findOne({ handle });
    return NextResponse.json({
      profile: profile
        ? {
            handle: profile.handle,
            author: profile.author,
            bio: profile.bio ?? "",
            avatarUrl: profile.avatar_url ?? profile.avatarUrl ?? "",
            privacy: vis.privacy,
            restricted: !vis.posts,
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
    const author =
      typeof body.author === "string" ? body.author.trim().slice(0, 80) : session.displayName;
    const nameCheck = checkDisplayNameAllowed(author);
    if (!nameCheck.ok) {
      return NextResponse.json({ error: nameCheck.reason }, { status: 400 });
    }
    if (!author.trim()) {
      return NextResponse.json({ error: "Display name is required" }, { status: 400 });
    }
    const bio = typeof body.bio === "string" ? body.bio.trim().slice(0, 160) : "";
    const avatarUrl =
      typeof body.avatarUrl === "string" && body.avatarUrl.startsWith("https://")
        ? body.avatarUrl.slice(0, 500)
        : "";

    const { db } = await connectToDatabase();

    const oldHandle = session.handle;
    let handle = oldHandle;

    // A signed-in member may set their username once/anytime: validate it and
    // move every handle-keyed row (posts, follows, prefs, …) to the new one.
    if (typeof body.handle === "string" && body.handle.trim() && body.handle !== oldHandle) {
      const norm = body.handle
        .trim()
        .toLowerCase()
        .replace(/^@/, "")
        .replace(/\s+/g, "");
      if (norm.length < 3 || norm.length > 30 || !/^[a-z0-9_]+$/.test(norm)) {
        return NextResponse.json(
          {
            error: "Username must be 3–30 letters, numbers, or underscores (no spaces, dots, or @).",
          },
          { status: 400 }
        );
      }
      const handleCheck = checkHandleAllowed(`@${norm}`);
      if (!handleCheck.ok) {
        return NextResponse.json({ error: handleCheck.reason }, { status: 400 });
      }
      const candidate = `@${norm}`;
      const taken = await db.collection("users").findOne({
        _id: { $ne: new ObjectId(session.id) },
        handle: { $in: [candidate, candidate.toLowerCase()] },
      });
      if (taken) {
        return NextResponse.json(
          { error: `@${norm} is already taken — try another username.` },
          { status: 409 }
        );
      }
      const oldVariants = Array.from(
        new Set([
          oldHandle,
          oldHandle.toLowerCase(),
          `@${oldHandle.replace(/^@/, "")}`,
          oldHandle.replace(/^@/, ""),
        ])
      );

      // Users: keep author link, point handle at the new username.
      const userNow = await db.collection("users").findOneAndUpdate(
        { _id: new ObjectId(session.id) },
        { $set: { handle: candidate, displayName: author, lastLoginAt: new Date().toISOString() } },
        { returnDocument: "after" }
      );
      if (!userNow) {
        return NextResponse.json({ error: "Could not rename — try again." }, { status: 500 });
      }

      // Posts, profiles, prefs, and any social rows keyed by the old handle.
      await db.collection("posts").updateMany(
        { $or: [{ user_id: session.id }, { handle: { $in: oldVariants } }] },
        { $set: { handle: candidate, author } }
      );
      await db.collection("profiles").updateMany(
        { handle: { $in: oldVariants } },
        { $set: { handle: candidate, author } }
      );
      const oldPrefs = await db.collection("user_prefs").findOne({
        handle: { $in: oldVariants },
      });
      if (oldPrefs) {
        const storedEmail =
          typeof oldPrefs.emailEnc === "string"
            ? oldPrefs.emailEnc
            : typeof oldPrefs.email === "string"
              ? oldPrefs.email
              : null;
        await upsertPrefs(
          db,
          candidate,
          {
            email: decryptEmail(storedEmail) ?? undefined,
            email_digest: Boolean(oldPrefs.email_digest),
            weekly_digest: Boolean(oldPrefs.weekly_digest),
            push_enabled: Boolean(oldPrefs.push_enabled),
            onboarded: oldPrefs.onboarded !== undefined ? Boolean(oldPrefs.onboarded) : true,
          }
        );
      }
      await db.collection("user_prefs").deleteMany({ handle: { $in: oldVariants } });
      await db.collection("messages").updateMany(
        { handle: { $in: oldVariants } },
        { $set: { handle: candidate } }
      );
      await db.collection("reactions").updateMany(
        { handle: { $in: oldVariants } },
        { $set: { handle: candidate } }
      );
      await db.collection("reports").updateMany(
        { reporter_handle: { $in: oldVariants } },
        { $set: { reporter_handle: candidate } }
      );
      await db.collection("reports").updateMany(
        { reported_handle: { $in: oldVariants } },
        { $set: { reported_handle: candidate } }
      );
      await db.collection("notifications").updateMany(
        { recipient_handle: { $in: oldVariants } },
        { $set: { recipient_handle: candidate } }
      );
      await db.collection("notifications").updateMany(
        { actor_handle: { $in: oldVariants } },
        { $set: { actor_handle: candidate } }
      );
      await db.collection("follows").updateMany(
        { follower: { $in: oldVariants } },
        { $set: { follower: candidate } }
      );
      await db.collection("follows").updateMany(
        { following: { $in: oldVariants } },
        { $set: { following: candidate } }
      );
      await db.collection("push_subscriptions").updateMany(
        { handle: { $in: oldVariants } },
        { $set: { handle: candidate } }
      );
      await db.collection("sessions").updateMany(
        { user_id: session.id },
        { $set: { handle: candidate } }
      );

      handle = candidate;
    } else {
      // Display-name-only update (handle unchanged).
      await db.collection("users").updateOne(
        { _id: new ObjectId(session.id) },
        { $set: { displayName: author, lastLoginAt: new Date().toISOString() } }
      );
      await db.collection("posts").updateMany(
        { user_id: session.id },
        { $set: { author } }
      );
    }

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

    const token = await createSession(
      { id: session.id, handle, displayName: author },
      { sid: session.sid, userAgent: request.headers.get("user-agent") }
    );

    const res = NextResponse.json({
      ok: true,
      user: {
        id: session.id,
        handle,
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
