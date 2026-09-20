import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { redactForStorage } from "@/lib/privacy";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { postHiddenFrom } from "@/lib/visibility";

const IP_REPORT_LIMIT = 20;
const IP_REPORT_WINDOW_MS = 10 * 60_000;

const VALID_REASONS = new Set([
  "Hate or harassment",
  "Unsafe or explicit",
  "Spam or coordinated accounts",
  "Misleading or fake story",
  "Sounds AI-generated",
  "Impersonation",
  "Harms someone",
]);

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
    const body = await request.json();
    const reason =
      typeof body.reason === "string" && VALID_REASONS.has(body.reason)
        ? body.reason
        : "other";
    const { db } = await connectToDatabase();
    if (await postHiddenFrom(db, session.handle, id)) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db.collection("reports").insertOne({
      post_id: id,
      reason,
      reporter_handle: session.handle,
      reported_handle:
        typeof body.reported_handle === "string" ? body.reported_handle : null,
      // Short, PII-scrubbed hint for keepers — never raw emails/phones.
      content_snippet:
        typeof body.content_snippet === "string"
          ? redactForStorage(body.content_snippet, 120)
          : null,
      status: "open",
      created_at: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
