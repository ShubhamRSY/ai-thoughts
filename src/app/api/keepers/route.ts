import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";

// Keepers are granted invite-only, by inserting a handle directly into the
// "keepers" collection (e.g. via the Atlas console or a trusted script) —
// intentionally not exposed as a public write endpoint.
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const keepers = await db.collection("keepers").find({}).toArray();
    return NextResponse.json({ keepers: keepers.map((k) => k.handle) });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
