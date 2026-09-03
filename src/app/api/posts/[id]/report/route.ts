import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { db } = await connectToDatabase();

    await db.collection("reports").insertOne({
      post_id: id,
      reason: body.reason ?? "",
      reported_handle: body.reported_handle ?? null,
      content_snippet: body.content_snippet ?? null,
      status: "open",
      created_at: new Date(),
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
