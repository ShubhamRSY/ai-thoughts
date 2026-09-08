import { NextRequest, NextResponse } from "next/server";
import { isKeeperHandle } from "@/lib/auth";

// Keepers are granted invite-only, by inserting a handle directly into the
// "keepers" collection (e.g. via the Atlas console or a trusted script) —
// intentionally not exposed as a public write endpoint.
//
// Only checks a single handle (never returns the full roster) — the keeper
// list itself is sensitive, since knowing who moderates makes them a target
// for harassment.
export async function GET(request: NextRequest) {
  try {
    const handle = new URL(request.url).searchParams.get("handle") ?? "";
    const keeper = handle ? await isKeeperHandle(handle) : false;
    return NextResponse.json({ isKeeper: keeper });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
