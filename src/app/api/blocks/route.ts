import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { blockUser, listBlocked, unblockUser } from "@/lib/blocks";
import { resolveProfiles } from "@/lib/follows";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    const { db } = await connectToDatabase();
    const blocked = await resolveProfiles(db, await listBlocked(db, session.handle));
    return NextResponse.json({ blocked });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const body = await request.json();
    const handle = typeof body.handle === "string" ? body.handle.trim() : "";
    if (!handle || (body.action !== "block" && body.action !== "unblock")) {
      return NextResponse.json({ error: "handle and a valid action are required" }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    if (body.action === "unblock") {
      await unblockUser(db, session.handle, handle);
      return NextResponse.json({ ok: true });
    }
    const result = await blockUser(db, session.handle, handle);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status ?? 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
