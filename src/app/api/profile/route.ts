import { NextRequest, NextResponse } from "next/server";
import { isAllowedMediaUrl } from "@/lib/media-sniff";
import { isFlaggedContent } from "@/lib/content-moderation";
import { rateLimit } from "@/lib/rate-limit";
import { ObjectId, type Db } from "mongodb";
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

/** Up to 3 unused usernames close to `norm`, for the "already taken" message. */
async function freeHandlesLike(db: Db, norm: string): Promise<string[]> {
  const base = norm.slice(0, 26);
  const rand = () => Math.floor(10 + Math.random() * 990);
  const candidates = Array.from(
    new Set([`${base}_ai`, `${base}_${rand()}`, `${base}${rand()}`, `the_${base}`.slice(0, 30), `${base}_voice`.slice(0, 30)])
  ).filter((c) => checkHandleAllowed(`@${c}`).ok);
  const used = await db
    .collection<{ handle: string }>("users")
    .find({ handle: { $in: candidates.map((c) => `@${c}`) } }, { projection: { handle: 1 } })
    .toArray();
  const usedSet = new Set(used.map((u) => u.handle.replace(/^@/, "")));
  return candidates.filter((c) => !usedSet.has(c)).slice(0, 3);
}

export async function GET(request: NextRequest) {
  try {
    const handle = request.nextUrl.searchParams.get("handle");
    if (!handle) return NextResponse.json({ profile: null });
    const { db } = await connectToDatabase();
    const session = await getSession();
    const vis = await getVisibility(db, session?.handle ?? null, handle);
    if (!vis.profile) return NextResponse.json({ profile: null });
    const profile = await db.collection("profiles").findOne({ handle });
    // Verified is an account-level flag — resolve it live from the users row.
    let verified = false;
    try {
      const variants = Array.from(
        new Set([handle, `@${handle.trim().toLowerCase().replace(/^@/, "")}`])
      );
      const userRow = await db
        .collection<{ verified?: boolean }>("users")
        .findOne({ handle: { $in: variants } }, { projection: { verified: 1 } });
      verified = Boolean(userRow?.verified);
    } catch {
      verified = false;
    }
    return NextResponse.json({
      profile: profile
        ? {
            handle: profile.handle,
            author: profile.author,
            bio: profile.bio ?? "",
            avatarUrl: profile.avatar_url ?? profile.avatarUrl ?? "",
            privacy: vis.privacy,
            restricted: !vis.posts,
            verified,
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
    // Per account, not per IP: a follow/spam bot rotating IPs is still capped.
    const { ok: withinLimit, retryInSec } = await rateLimit(`profile-edit:${session.id}`, 30, 10 * 60_000);
    if (!withinLimit) {
      return NextResponse.json(
        { error: "Too many profile edits — try again shortly", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

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
    // Fields left out of the request keep their saved value (e.g. the onboarding
    // name/username save must not wipe a bio or photo).
    const bio = typeof body.bio === "string" ? body.bio.trim().slice(0, 160) : undefined;
    // "" clears the photo; anything else must be our own Blob store, like post
    // media (any https URL let a profile load a third-party tracker for viewers).
    if (typeof body.avatarUrl === "string" && body.avatarUrl && !isAllowedMediaUrl(body.avatarUrl)) {
      return NextResponse.json({ error: "Profile photo must be uploaded here" }, { status: 400 });
    }
    const avatarUrl =
      typeof body.avatarUrl === "string" ? (body.avatarUrl ? body.avatarUrl.slice(0, 500) : null) : undefined;
    if (avatarUrl && (await isFlaggedContent({ imageUrl: avatarUrl }))) {
      return NextResponse.json({ error: "That photo breaks the community guidelines — choose another." }, { status: 400 });
    }

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
          {
            error: `@${norm} is already taken — try another username.`,
            suggestions: await freeHandlesLike(db, norm),
          },
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
          ...(bio !== undefined && { bio }),
          ...(avatarUrl !== undefined && { avatar_url: avatarUrl }),
          updated_at: new Date(),
        },
      },
      { upsert: true }
    );

    // Saving a profile completes the onboarding profile step for good, so a
    // member who leaves mid-wizard is never asked for it again.
    await upsertPrefs(db, handle, { onboarded: true });

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
