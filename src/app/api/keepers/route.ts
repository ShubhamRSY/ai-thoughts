import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const keepers = await db.collection("keepers").find({}).toArray();
    return NextResponse.json({ keepers: keepers.map((k) => k.handle) });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { db } = await connectToDatabase();
    await db.collection("keepers").insertOne({
      user_id: body.user_id ?? null,
      handle: body.handle ?? "",
      created_at: new Date(),
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
