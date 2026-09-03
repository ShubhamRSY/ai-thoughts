import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const reports = await db
      .collection("reports")
      .find({ status: "open" })
      .sort({ created_at: -1 })
      .limit(100)
      .toArray();
    return NextResponse.json(
      reports.map((r) => ({
        id: r._id.toString(),
        post_id: r.post_id,
        reason: r.reason,
        reported_handle: r.reported_handle ?? null,
        content_snippet: r.content_snippet ?? null,
        status: r.status,
        created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      }))
    );
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
