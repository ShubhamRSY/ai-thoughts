import { NextResponse } from "next/server";
import { exportRows } from "@/lib/user-pairs";
import { BLOCKS } from "@/lib/blocks";
import { MUTES } from "@/lib/mutes";
import { exportSentDms } from "@/lib/dms";
import { ObjectId } from "mongodb";
import {
  clearSessionCookie,
  deleteUserAccount,
  getSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  type SessionUser,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { listFollowing } from "@/lib/follows";
import { getPrefs } from "@/lib/prefs";
import { signMediaUrl } from "@/lib/media-access";
import { reportError } from "@/lib/report-error";

function handleVariants(session: SessionUser): string[] {
  return Array.from(
    new Set([
      session.handle,
      session.handle.toLowerCase(),
      `@${session.handle.replace(/^@/, "")}`,
      session.handle.replace(/^@/, ""),
    ])
  );
}

/**
 * GET /api/account — export the signed-in user's data (JSON download).
 */
export async function GET(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const ip = clientIp(request);
    const { ok, retryInSec } = await rateLimit(`account-export:${ip}`, 10, 60 * 60_000);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many exports — try again later", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    const { db } = await connectToDatabase();
    const variants = handleVariants(session);

    let userDoc = null;
    try {
      userDoc = await db.collection("users").findOne(
        { _id: new ObjectId(session.id) },
        { projection: { emailEnc: 0, emailHash: 0, email: 0 } }
      );
    } catch {
      userDoc = await db.collection("users").findOne(
        { handle: { $in: variants } },
        { projection: { emailEnc: 0, emailHash: 0, email: 0 } }
      );
    }

    const posts = await db
      .collection("posts")
      .find({
        $or: [{ user_id: session.id }, { handle: { $in: variants } }],
      })
      .project({ integrity_hash: 0 })
      .sort({ created_at: -1 })
      .limit(500)
      .toArray();

    const postIds = posts.map((p) => p._id?.toString()).filter(Boolean) as string[];

    const [messages, reactions, notifications, following, prefs, pushCount] =
      await Promise.all([
        db
          .collection("messages")
          .find({
            $or: [
              { handle: { $in: variants } },
              ...(postIds.length ? [{ post_id: { $in: postIds } }] : []),
            ],
          })
          .limit(1000)
          .toArray(),
        db
          .collection("reactions")
          .find({
            $or: [
              { handle: { $in: variants } },
              ...(postIds.length ? [{ post_id: { $in: postIds } }] : []),
            ],
          })
          .limit(1000)
          .toArray(),
        db
          .collection("notifications")
          .find({
            $or: [
              { recipient_handle: { $in: variants } },
              { actor_handle: { $in: variants } },
            ],
          })
          .limit(500)
          .toArray(),
        listFollowing(db, session.handle),
        getPrefs(db, session.handle),
        db.collection("push_subscriptions").countDocuments({
          handle: { $in: variants },
        }),
      ]);

    const handleNorm = session.handle.trim().toLowerCase().replace(/^@/, "");
    const [moods, blocked, muted, directMessages] = await Promise.all([
      db.collection("moods").find({ handle_norm: handleNorm }).project({ _id: 0, day: 1, feeling: 1, source: 1 }).toArray(),
      exportRows(db, BLOCKS, session.id, variants),
      exportRows(db, MUTES, session.id, variants),
      exportSentDms(db, session.id),
    ]);

    const exportPayload = {
      exported_at: new Date().toISOString(),
      moods,
      blocked,
      muted,
      direct_messages_sent: directMessages,
      account: {
        id: session.id,
        email: session.email,
        handle: session.handle,
        displayName: session.displayName,
        profile: userDoc,
      },
      prefs: {
        email_digest: prefs.email_digest,
        weekly_digest: prefs.weekly_digest,
        push_enabled: prefs.push_enabled,
        // email intentionally omitted from prefs blob if encrypted separately —
        // session.email is the decrypted contact address.
        contact_email: session.email,
      },
      following,
      push_subscription_count: pushCount,
      // The export is the owner's own data: signed links let them download
      // their private files (valid for an hour).
      posts: await Promise.all(posts.map(async (p) => ({
        id: p._id?.toString(),
        content: p.content,
        media_type: p.media_type,
        feeling: p.feeling,
        tags: p.tags,
        language: p.language,
        prompt_day: p.prompt_day,
        created_at: p.created_at,
        media_url: await signMediaUrl(p.media_url),
      }))),
      messages: messages.map((m) => ({
        id: m._id?.toString(),
        post_id: m.post_id,
        body: m.body,
        created_at: m.created_at,
      })),
      reactions: reactions.map((r) => ({
        post_id: r.post_id,
        reaction: r.reaction,
        created_at: r.created_at,
      })),
      notifications: notifications.map((n) => ({
        kind: n.kind,
        preview: n.preview,
        actor_handle: n.actor_handle,
        created_at: n.created_at,
        read: n.read,
      })),
    };

    const body = JSON.stringify(exportPayload, null, 2);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="ai-thoughts-export-${session.handle.replace(/^@/, "")}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("account export error:", e);
    reportError(e, { route: "api/account" });
    return NextResponse.json({ error: "Could not export account" }, { status: 500 });
  }
}

/**
 * DELETE /api/account — self-serve account wipe for the signed-in user.
 * Body: { confirm: "DELETE" } required.
 */
export async function DELETE(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }

    const ip = clientIp(request);
    const { ok, retryInSec, unavailable } = await rateLimit(`account-delete:${ip}`, 5, 60 * 60_000);
    // The shared limiter is down and deletion fails closed (M1).
    if (unavailable) {
      return NextResponse.json(
        { error: "Account deletion is briefly unavailable — try again in a moment", retry_in_sec: 30 },
        { status: 503, headers: { "Retry-After": "30" } }
      );
    }
    if (!ok) {
      return NextResponse.json(
        { error: "Too many attempts — try again later", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    let confirm = "";
    try {
      const body = (await request.json()) as { confirm?: string };
      confirm = typeof body.confirm === "string" ? body.confirm.trim() : "";
    } catch {
      confirm = "";
    }
    if (confirm !== "DELETE") {
      return NextResponse.json(
        { error: 'Send { "confirm": "DELETE" } to wipe your account' },
        { status: 400 }
      );
    }

    await deleteUserAccount(session);
    await clearSessionCookie();

    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
    return res;
  } catch (e) {
    console.error("account delete error:", e);
    reportError(e, { route: "api/account" });
    return NextResponse.json({ error: "Could not delete account" }, { status: 500 });
  }
}
