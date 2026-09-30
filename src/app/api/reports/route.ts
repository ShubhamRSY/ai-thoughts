import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { isKeeperUser } from "@/lib/admin";
import { redactForStorage } from "@/lib/privacy";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { canViewPost } from "@/lib/visibility";
import { reportError } from "@/lib/report-error";
import { CHILD_SAFETY, isReportReason } from "@/lib/report-reasons";
import { holdIfWarranted, reporterStandings, withinChildSafetyLimit } from "@/lib/report-trust";

const IP_REPORT_LIMIT = 20;
const IP_REPORT_WINDOW_MS = 10 * 60_000;


type ReportTargetKind = "post" | "comment" | "user";

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function parseObjectId(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (!(await isKeeperUser(session.id))) {
      return NextResponse.json({ error: "Keepers only" }, { status: 403 });
    }

    const { db } = await connectToDatabase();
    // Child-safety reports come first and are fetched first, so a backlog of
    // other reports can never push one off the page (M3).
    const open = (reason: object) =>
      db.collection("reports").find({ status: "open", reason }).sort({ created_at: -1 }).limit(100).toArray();
    const [urgent, rest] = await Promise.all([open({ $eq: CHILD_SAFETY }), open({ $ne: CHILD_SAFETY })]);
    const reports = [...urgent, ...rest].slice(0, Math.max(100, urgent.length));

    // For child-safety rows: is the take hidden yet, and how have this
    // reporter's earlier child-safety reports turned out?
    const heldIds = new Set(
      (
        await db
          .collection("posts")
          .find({
            _id: { $in: urgent.map((r) => parseObjectId(String(r.post_id))).filter((x): x is ObjectId => x !== null) },
            moderation_hold: true,
          })
          .project({ _id: 1 })
          .toArray()
      ).map((p) => p._id.toString())
    );
    const standing = await reporterStandings(
      db,
      urgent.map((r) => r.reporter_id).filter((id): id is string => typeof id === "string")
    );
    return NextResponse.json(
      reports.map((r) => ({
        id: r._id.toString(),
        post_id: r.post_id,
        // "post" | "comment" | "user" — later rows carry an explicit type; a
        // missing one is legacy post-only data.
        target_type: r.target_type ?? "post",
        reason: r.reason,
        reported_handle: r.reported_handle ?? null,
        content_snippet: r.content_snippet ?? null,
        status: r.status,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
        ...(r.reason === CHILD_SAFETY
          ? {
              priority: "high",
              post_held: heldIds.has(String(r.post_id)),
              reporter_standing: (typeof r.reporter_id === "string" && standing.get(r.reporter_id)) || null,
            }
          : {}),
      }))
    );
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/reports" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/**
 * POST /api/reports — report a take, a comment, or an account. Target info is
 * resolved server-side against the live row (never taken verbatim from the
 * client), so the queue can't be spoofed into blaming the wrong handle. One
 * report per (target, reporter) keeps the desk quiet.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const ip = clientIp(request);
    const { ok: ipOk } = await rateLimit(`report:${ip}`, IP_REPORT_LIMIT, IP_REPORT_WINDOW_MS);
    if (!ipOk) {
      return NextResponse.json({ error: "Too many reports — slow down" }, { status: 429 });
    }

    const body = await request.json();
    const targetType = String(body.target_type ?? "post") as ReportTargetKind;
    if (targetType !== "post" && targetType !== "comment" && targetType !== "user") {
      return NextResponse.json({ error: "Invalid target_type" }, { status: 400 });
    }
    const targetId = typeof body.target_id === "string" ? body.target_id.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";
    if (!isReportReason(reason) || !targetId) {
      return NextResponse.json(
        { error: "Invalid report reason or missing target" },
        { status: 400 }
      );
    }

    if (reason === CHILD_SAFETY) {
      const { ok, retryInSec } = await withinChildSafetyLimit(session.id);
      if (!ok) {
        return NextResponse.json(
          { error: "You've sent several child-safety reports today — keepers are reviewing them. Try again later.", retry_in_sec: retryInSec },
          { status: 429 }
        );
      }
    }

    const { db } = await connectToDatabase();

    // Resolve the reported handle from the row itself — client-supplied
    // handles are never trusted for who "owned" the content.
    let reportedHandle: string | null = null;
    let contentSnippet: string | null =
      typeof body.content_snippet === "string"
        ? redactForStorage(body.content_snippet, 120)
        : null;
    let viewCheckFailed = false;

    if (targetType === "post" || targetType === "comment") {
      const objectId = parseObjectId(targetId);
      if (!objectId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
      if (targetType === "post") {
        const post = await db
          .collection("posts")
          .findOne({ _id: objectId }, { projection: { handle: 1, reported: 1 } });
        if (!post || !(await canViewPost(db, session.handle, post))) {
          viewCheckFailed = true;
        } else if (typeof post.handle === "string") {
          reportedHandle = post.handle;
        }
      } else {
        // A comment is only reportable while its parent take is viewable.
        const msg = await db.collection("messages").findOne({ _id: objectId });
        if (!msg?.post_id) {
          viewCheckFailed = true;
        } else {
          const post = await db
            .collection("posts")
            .findOne(
              { _id: parseObjectId(String(msg.post_id)) ?? undefined },
              { projection: { handle: 1 } }
            );
          if (!post || !(await canViewPost(db, session.handle, post))) {
            viewCheckFailed = true;
          } else {
            reportedHandle = typeof msg.handle === "string" ? msg.handle : reportedHandle;
            contentSnippet =
              contentSnippet ??
              redactForStorage(typeof msg.body === "string" ? msg.body : "", 120);
          }
        }
      }
    } else {
      const h = normHandle(targetId);
      const user = await db
        .collection("users")
        .findOne({ handle: { $in: [h, `@${h}`] } }, { projection: { handle: 1 } });
      if (!user) viewCheckFailed = true;
      else if (normHandle(String(user.handle)) === normHandle(session.handle)) {
        return NextResponse.json({ error: "You can't report yourself" }, { status: 400 });
      } else reportedHandle = String(user.handle);
    }

    if (viewCheckFailed) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const reports = db.collection("reports");
    // One report per (target, reporter) — duplicate noise is swallowed.
    // target_id rides in the legacy `post_id` field so the existing unique
    // index (reports_post_reporter_unique) enforces it for every target kind.
    const existing = await reports.findOne({
      post_id: targetId,
      reporter_handle: session.handle,
    });
    if (existing) return NextResponse.json({ ok: true, alreadyReported: true });

    try {
      await reports.insertOne({
        post_id: targetId,
        target_type: targetType,
        reason,
        reporter_handle: session.handle,
        reporter_id: session.id,
        reported_handle: reportedHandle,
        content_snippet: contentSnippet,
        status: "open",
        ...(reason === CHILD_SAFETY ? { priority: "high" } : {}),
        created_at: new Date(),
      });
      // Child safety: hide the take now if this reporter is trusted or enough
      // independent people reported it (lib/report-trust.ts); either way it's
      // at the top of the keeper queue. "Keep & resolve" puts a hidden take back.
      if (reason === CHILD_SAFETY && targetType === "post") {
        await holdIfWarranted(db, parseObjectId(targetId)!, session.id);
      }
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        (error as { code?: number }).code === 11000
      ) {
        return NextResponse.json({ ok: true, alreadyReported: true });
      }
      throw error;
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/reports" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
