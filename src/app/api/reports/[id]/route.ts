import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getSession, isKeeperHandle } from "@/lib/auth";

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
    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      return NextResponse.json({ error: "Invalid id" }, { status: 400 });
    }

    const action = new URL(request.url).searchParams.get("action");
    const { db } = await connectToDatabase();
    await db
      .collection("reports")
      .updateOne({ _id: objectId }, { $set: { status: "resolved" } });
    return NextResponse.json({ ok: true, action });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
