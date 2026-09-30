import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { authorizeCron } from "@/lib/cron-auth";
import { cleanupUnattachedUploads } from "@/lib/upload-cleanup";
import { reportError } from "@/lib/report-error";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/cron/cleanup-uploads — daily removal of uploads never attached
 * within 24h (lib/upload-cleanup.ts). Reports only, until
 * UPLOAD_CLEANUP_APPLY=1 is set; ?dry_run=1 always only reports.
 */
export async function GET(request: NextRequest) {
  try {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const apply =
      process.env.UPLOAD_CLEANUP_APPLY === "1" && request.nextUrl.searchParams.get("dry_run") !== "1";
    const { db } = await connectToDatabase();
    const result = await cleanupUnattachedUploads(db, { apply });
    console.log("upload cleanup:", JSON.stringify({ ...result, sample: undefined }));
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error("upload cleanup failed:", e);
    reportError(e, { route: "api/cron/cleanup-uploads", service: "blob" });
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
