import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { isKeeperUser } from "@/lib/admin";
import { logSecurityEvent } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { reportError } from "@/lib/report-error";
import { reportedChatForReview } from "@/lib/dms";

/**
 * GET /api/reports/[id]/chat — keepers only: the messages behind a chat
 * report, up to the moment it was filed. Chats are private, so this is the
 * only way anyone but the two members reads one, and every read is audited.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    if (!(await isKeeperUser(session.id))) return NextResponse.json({ error: "Keepers only" }, { status: 403 });

    const { id } = await params;
    if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    const { db } = await connectToDatabase();
    const report = await db.collection("reports").findOne({ _id: new ObjectId(id), target_type: "chat" });
    if (!report) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const reportedAt = report.created_at instanceof Date ? report.created_at : new Date();
    const chat = await reportedChatForReview(
      db,
      String(report.post_id),
      reportedAt,
      typeof report.reported_handle === "string" ? report.reported_handle : null
    );

    await logSecurityEvent(db, {
      action: "view_reported_chat",
      actorHandle: session.handle,
      via: "session",
      ip: clientIp(request),
      detail: { report_id: id, conversation_id: String(report.post_id) },
    });

    if (!chat) return NextResponse.json({ error: "This chat no longer exists" }, { status: 404 });
    return NextResponse.json(chat);
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/reports/[id]/chat" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
