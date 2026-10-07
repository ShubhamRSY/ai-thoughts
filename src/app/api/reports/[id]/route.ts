import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { isKeeperUser } from "@/lib/admin";
import { logSecurityEvent } from "@/lib/audit";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { deletePostCascade, banUser, releaseModerationHold, AUTO_REPORTER } from "@/lib/moderation";
import { reportError } from "@/lib/report-error";
import { recordOutcome } from "@/lib/report-trust";

// Keepers can also delete via DELETE /api/posts/[id] or archive; these are the
// "handle it here" desk buttons a report row knows how to resolve:
//   resolve      — nothing further, keep the content
//   dismiss      — same as resolve, from the "false alarm" path
//   ignore       — same as resolve, from the "under review" path (resolved-count parity)
//   remove_post  — actually delete the take and its cascade
//   remove_comment — delete the reported comment
//   ban          — suspend the responsible account + remove their takes
const VALID_ACTIONS = new Set([
  "resolve",
  "dismiss",
  "ignore",
  "remove_post",
  "remove_comment",
  "ban",
]);

function parseObjectId(id: string): ObjectId | null {
  try {
    return new ObjectId(id);
  } catch {
    return null;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (!(await isKeeperUser(session.id))) {
      return NextResponse.json({ error: "Keepers only" }, { status: 403 });
    }
    // The most destructive write in the app (bans, cascades): bound what one
    // keeper session can do in a burst, even a stolen one.
    const { ok: withinLimit, retryInSec } = await rateLimit(`report-action:${session.id}`, 120, 10 * 60_000);
    if (!withinLimit) {
      return NextResponse.json({ error: "Too many actions — try again shortly", retry_in_sec: retryInSec }, { status: 429 });
    }

    const { id } = await params;
    const objectId = parseObjectId(id);
    if (!objectId) return NextResponse.json({ error: "Invalid id" }, { status: 400 });

    const action = new URL(request.url).searchParams.get("action") ?? "";
    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json(
        { error: "Invalid action", allowed: [...VALID_ACTIONS] },
        { status: 400 }
      );
    }

    const { db } = await connectToDatabase();
    const report = await db.collection("reports").findOne(
      { _id: objectId },
      { projection: { post_id: 1, reported_handle: 1, target_type: 1, status: 1, reason: 1, reporter_id: 1, reporter_handle: 1 } }
    );
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (report.target_type === "chat" && (action === "remove_post" || action === "remove_comment")) {
      return NextResponse.json({ error: "A chat report can be resolved or the account banned" }, { status: 400 });
    }

    // Credit reporters before acting: removing a take deletes its reports (M3).
    if (report.status !== "resolved") await recordOutcome(db, report, action);

    // ---------- the actual moderation ----------
    if (action === "remove_post") {
      const target = parseObjectId(String(report.post_id ?? ""));
      if (target) await deletePostCascade(db, target, session.handle);
    } else if (action === "remove_comment") {
      const target = parseObjectId(String(report.post_id ?? ""));
      if (target) await db.collection("messages").deleteOne({ _id: target });
    } else if (action === "ban") {
      if (typeof report.reported_handle === "string") {
        await banUser(db, report.reported_handle);
      }
    } else if (report.target_type === "user" && report.reporter_handle === AUTO_REPORTER) {
      // Cleared an automatic strike report: the filters misfired, so lift the pause.
      if (typeof report.reported_handle === "string") {
        const h = report.reported_handle.trim().toLowerCase().replace(/^@/, "");
        await db
          .collection("users")
          .updateOne({ handle: { $in: [h, `@${h}`] } }, { $unset: { posting_paused_until: "" } });
      }
    } else if (report.target_type !== "comment" && report.target_type !== "chat") {
      // Kept the content: an automatic hold (screenMediaPost) comes off.
      const target = parseObjectId(String(report.post_id ?? ""));
      if (target) await releaseModerationHold(db, target);
    }

    const resolvedAt = new Date();
    await db.collection("reports").updateOne(
      { _id: objectId },
      {
        $set: {
          status: "resolved",
          resolution: action,
          resolved_by: session.handle,
          resolved_at: resolvedAt,
        },
      }
    );

    // Keep an audit trail: keepers are privileged, so who did what and when
    // must be reconstructable after the fact.
    await logSecurityEvent(db, {
      action: "resolve_report",
      actorHandle: session.handle,
      via: "session",
      ip: clientIp(request),
      detail: {
        report_id: id,
        target_type: report.target_type ?? "post",
        target_id: report.post_id,
        resolution: action,
      },
    });

    return NextResponse.json({ ok: true, action });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/reports/[id]" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}