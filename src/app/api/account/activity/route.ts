import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { handleVariants, hiddenAuthorFilter } from "@/lib/visibility";

import { reportError } from "@/lib/report-error";
const PER_SOURCE = 40;
const MAX_ITEMS = 60;
const REACTION_TYPES: Record<string, string> = { "❤️": "like", "🔁": "repost", "🔖": "save" };

type Item = {
  id: string;
  type: string;
  at: string;
  post_id?: string;
  preview?: string;
  handle?: string;
  archived?: boolean;
};

const iso = (d: unknown) => (d instanceof Date ? d : new Date(0)).toISOString();
const clip = (s: unknown, n = 120) => String(s ?? "").slice(0, n);

/**
 * GET /api/account/activity?type=all|posts|replies|reactions|follows
 * The caller's own history, derived from existing collections (no separate log).
 * Previews of other people's takes are only included while the caller can still see them.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const group = request.nextUrl.searchParams.get("type") ?? "all";
    const want = (g: string) => group === "all" || group === g;
    const me = handleVariants(session.handle);
    const { db } = await connectToDatabase();
    const items: Item[] = [];

    if (want("posts")) {
      const posts = await db
        .collection("posts")
        .find({ handle: { $in: me } })
        .sort({ created_at: -1 })
        .limit(PER_SOURCE)
        .project({ content: 1, created_at: 1, archived: 1 })
        .toArray();
      for (const p of posts) {
        items.push({
          id: `post:${p._id}`,
          type: "post",
          at: iso(p.created_at),
          post_id: String(p._id),
          preview: clip(p.content),
          archived: p.archived === true || undefined,
        });
      }
    }

    if (want("replies")) {
      const replies = await db
        .collection("messages")
        .find({ handle: { $in: me } })
        .sort({ created_at: -1 })
        .limit(PER_SOURCE)
        .toArray();
      for (const m of replies) {
        items.push({
          id: `reply:${m._id}`,
          type: "reply",
          at: iso(m.created_at),
          post_id: String(m.post_id),
          preview: clip(m.body),
        });
      }
    }

    if (want("reactions")) {
      const reactions = await db
        .collection("reactions")
        .find({ handle: { $in: me } })
        .sort({ created_at: -1 })
        .limit(PER_SOURCE)
        .toArray();
      const ids = reactions
        .map((r) => {
          try {
            return new ObjectId(String(r.post_id));
          } catch {
            return null;
          }
        })
        .filter((v): v is ObjectId => v !== null);
      // Only show what the caller can still see: not archived, not hidden by privacy or a block.
      const visible = ids.length
        ? await db
            .collection("posts")
            .find({
              _id: { $in: ids },
              archived: { $ne: true },
              ...(await hiddenAuthorFilter(db, session.handle)),
            })
            .project({ content: 1 })
            .toArray()
        : [];
      const previews = new Map(visible.map((p) => [String(p._id), clip(p.content)]));
      for (const r of reactions) {
        items.push({
          id: `reaction:${r._id}`,
          type: REACTION_TYPES[String(r.reaction)] ?? "reaction",
          at: iso(r.created_at),
          post_id: String(r.post_id),
          preview: previews.get(String(r.post_id)),
        });
      }
    }

    if (want("follows")) {
      const follows = await db
        .collection("follows")
        .find({ follower: { $in: me } })
        .sort({ created_at: -1 })
        .limit(PER_SOURCE)
        .toArray();
      for (const f of follows) {
        items.push({
          id: `follow:${f._id}`,
          type: f.status === "pending" ? "follow_request" : "follow",
          at: iso(f.created_at ?? f.updated_at),
          handle: String(f.following),
        });
      }
    }

    items.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return NextResponse.json({ items: items.slice(0, MAX_ITEMS) });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/account/activity" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
