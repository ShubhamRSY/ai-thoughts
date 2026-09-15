import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";

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

    const { id } = await params;
    const body = await request.json();
    const reason = typeof body.reason === "string" && VALID_REASONS.has(body.reason) ? body.reason : "other";
    const { db } = await connectToDatabase();

    await db.collection("reports").insertOne({
      post_id: id,
      reason,
      reporter_handle: session.handle,
      reported_handle: typeof body.reported_handle === "string" ? body.reported_handle : null,
      content_snippet:
        typeof body.content_snippet === "string" ? body.content_snippet.slice(0, 200) : null,
      status: "open",
      created_at: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
