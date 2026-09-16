import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import {
  getCommunity,
  isMember,
  joinCommunity,
  leaveCommunity,
} from "@/lib/communities";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const { db } = await connectToDatabase();
    const community = await getCommunity(db, slug);
    if (!community) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const session = await getSession();
    return NextResponse.json({
      community: {
        slug: community.slug,
        name: community.name,
        description: community.description,
        creator_handle: community.creator_handle,
        creator_author: community.creator_author,
        member_count: community.member_handles.length,
        joined: session ? isMember(community, session.handle) : false,
      },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const { slug } = await params;
    const body = await request.json().catch(() => ({}));
    const action = body.action === "leave" ? "leave" : "join";
    const { db } = await connectToDatabase();

    if (action === "leave") {
      await leaveCommunity(db, slug, session.handle);
      return NextResponse.json({ ok: true, joined: false });
    }

    const result = await joinCommunity(db, slug, session.handle);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, joined: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
