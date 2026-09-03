import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const action = new URL(request.url).searchParams.get("action");
    const { db } = await connectToDatabase();
    await db
      .collection("reports")
      .updateOne({ _id: new ObjectId(id) }, { $set: { status: "resolved" } });
    return NextResponse.json({ ok: true, action });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
