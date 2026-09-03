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

    const existing = await db.collection("reactions").findOne({
      post_id: id,
      handle: body.handle ?? "anonymous",
      reaction: body.reaction,
    });

    if (existing) {
      await db.collection("reactions").deleteOne({ _id: existing._id });
      return NextResponse.json({ ok: true, action: "removed" });
    }

    await db.collection("reactions").insertOne({
      post_id: id,
      handle: body.handle ?? "anonymous",
      reaction: body.reaction,
      created_at: new Date(),
    });

    return NextResponse.json({ ok: true, action: "added" });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
