import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getSession, isKeeperHandle } from "@/lib/auth";
import { logSecurityEvent } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { deletePostCascade, banUser } from "@/lib/moderation";

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
    if (!(await isKeeperHandle(session.handle))) {
      return NextResponse.json({ error: "Keepers only" }, { status: 403 });
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
      { projection: { post_id: 1, reported_handle: 1, target_type: 1, status: 1 } }
    );
    if (!report) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ---------- the actual moderation ----------
    if (action === "remove_post") {
      const target = parseObjectId(String(report.post_id ?? ""));
      if (target) await deletePostCascade(db, target);
    } else if (action === "remove_comment") {
      const target = parseObjectId(String(report.post_id ?? ""));
      if (target) await db.collection("messages").deleteOne({ _id: target });
    } else if (action === "ban") {
      if (typeof report.reported_handle === "string") {
        await banUser(db, report.reported_handle);
      }
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
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}