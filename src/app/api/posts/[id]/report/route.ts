import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { redactForStorage } from "@/lib/privacy";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { canViewPost } from "@/lib/visibility";
import { reportError } from "@/lib/report-error";
import { CHILD_SAFETY, REPORT_REASONS, isReportReason } from "@/lib/report-reasons";
import { holdIfWarranted, withinChildSafetyLimit } from "@/lib/report-trust";

const IP_REPORT_LIMIT = 20;
const IP_REPORT_WINDOW_MS = 10 * 60_000;


const MAX_REPORTED_HANDLE = 64;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const ip = clientIp(request);
    const { ok: ipOk } = await rateLimit(`report:${ip}`, IP_REPORT_LIMIT, IP_REPORT_WINDOW_MS);
    if (!ipOk) {
      return NextResponse.json({ error: "Too many reports — slow down" }, { status: 429 });
    }

    const { id } = await params;
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }
    const body = await request.json();
    const reason =
      typeof body.reason === "string" ? body.reason.trim() : "";
    if (!isReportReason(reason)) {
      return NextResponse.json(
        { error: "Invalid report reason", allowed: REPORT_REASONS },
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
    const post = await db
      .collection("posts")
      .findOne({ _id: objectId }, { projection: { handle: 1, archived: 1 } });
    // A report must point at a real, currently-viewable take — otherwise the
    // reports queue fills with junk aimed at ghosts.
    if (!post || !(await canViewPost(db, session.handle, post))) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const reports = db.collection("reports");
    // One report per (post, reporter) keeps the desk free of duplicate noise
    // and stops one user from farming fake heat onto a single take.
    const existing = await reports.findOne({
      post_id: id,
      reporter_handle: session.handle,
    });
    if (existing) {
      return NextResponse.json({ ok: true, alreadyReported: true });
    }

    try {
      await reports.insertOne({
        post_id: id,
        reason,
        reporter_handle: session.handle,
        reporter_id: session.id,
        // The reported author comes from the post itself — never trust the
        // client with who "owned" the content.
        reported_handle:
          typeof post.handle === "string"
            ? post.handle
            : typeof body.reported_handle === "string"
              ? body.reported_handle.slice(0, MAX_REPORTED_HANDLE)
              : null,
        // Short, PII-scrubbed hint for keepers — never raw emails/phones.
        content_snippet:
          typeof body.content_snippet === "string"
            ? redactForStorage(body.content_snippet, 120)
            : null,
        status: "open",
        ...(reason === CHILD_SAFETY ? { priority: "high" } : {}),
        created_at: new Date(),
      });
      // Child safety: hide now if trusted/independently reported (lib/report-trust.ts).
      if (reason === CHILD_SAFETY) await holdIfWarranted(db, objectId, session.id);
    } catch (error) {
      // Another request won the (post, reporter) dedupe race.
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
    reportError(error, { route: "api/posts/[id]/report" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
