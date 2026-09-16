import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import {
  createCommunity,
  isMember,
  listCommunities,
  listMyCommunities,
} from "@/lib/communities";

function serialize(c: {
  slug: string;
  name: string;
  description: string;
  creator_handle: string;
  creator_author: string;
  member_handles: string[];
  created_at: Date;
  updated_at: Date;
}) {
  return {
    slug: c.slug,
    name: c.name,
    description: c.description,
    creator_handle: c.creator_handle,
    creator_author: c.creator_author,
    member_count: c.member_handles?.length ?? 0,
    created_at:
      c.created_at instanceof Date ? c.created_at.toISOString() : String(c.created_at),
    updated_at:
      c.updated_at instanceof Date ? c.updated_at.toISOString() : String(c.updated_at),
  };
}

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    const mine = request.nextUrl.searchParams.get("mine") === "1";
    const session = await getSession();

    if (mine) {
      if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
      const rows = await listMyCommunities(db, session.handle);
      return NextResponse.json({
        communities: rows.map((c) => ({
          ...serialize(c),
          joined: true,
        })),
      });
    }

    const rows = await listCommunities(db, { limit: 40 });
    return NextResponse.json({
      communities: rows.map((c) => ({
        ...serialize(c),
        joined: session ? isMember(c, session.handle) : false,
      })),
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const ip = clientIp(request);
    const { ok, retryInSec } = rateLimit(`community-create:${ip}`, 8, 60 * 60_000);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many pages created — try later", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { db } = await connectToDatabase();
    const result = await createCommunity(db, {
      name: typeof body.name === "string" ? body.name : "",
      description: typeof body.description === "string" ? body.description : "",
      slug: typeof body.slug === "string" ? body.slug : undefined,
      creatorHandle: session.handle,
      creatorAuthor: session.displayName || session.handle,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      community: { ...serialize(result.community), joined: true },
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
