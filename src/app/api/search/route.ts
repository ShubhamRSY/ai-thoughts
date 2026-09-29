import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { listFollowing, listRequested } from "@/lib/follows";
import { hiddenHandles, canViewPosts } from "@/lib/visibility";
import { reportError } from "@/lib/report-error";

function norm(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function withAt(h: string) {
  const n = norm(h);
  return n ? `@${n}` : "";
}

// Max 3.6% of this limit per 15min; search is regex over content so keep it
// cheap — no same query twice within the window.
const SEARCH_LIMIT = 30;
const SEARCH_WINDOW_MS = 15 * 60_000;
const SEARCH_SCAN_POSTS = 5000;

export type SearchPostHit = {
  id: string;
  handle: string;
  author: string;
  content: string;
  media_type: string;
  created_at: string;
  tags: string[];
};

/**
 * GET /api/search?q=... — unified search over people, takes, and hashtags.
 * Each surface enforces the same visibility rules as its main route: locked
 * accounts and blocked pairs never appear, and takes only surface when the
 * viewer could open them (private threads included for approved followers).
 */
export async function GET(request: NextRequest) {
  try {
    const ip = clientIp(request);
    const { ok, retryInSec } = await rateLimit(`search:${ip}`, SEARCH_LIMIT, SEARCH_WINDOW_MS);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many searches — try again shortly", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    const qRaw = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const q = qRaw.replace(/^@/, "").slice(0, 40);
    if (!q) {
      return NextResponse.json({ people: [], posts: [], query: "" });
    }

    const { db } = await connectToDatabase();
    const session = await getSession();
    const me = session ? norm(session.handle) : null;
    const viewer = session?.handle ?? null;
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const rx = new RegExp(safe, "i");

    const [followingList, requestedList, blockedHidden] = await Promise.all([
      viewer ? listFollowing(db, viewer) : [],
      viewer ? listRequested(db, viewer) : [],
      // Blocks always hide with any privacy level; locked stays hidden to
      // strangers. "locked" level is in the `people` surface exactly as in
      // /api/people; takes additionally enforce per-post visibility below.
      hiddenHandles(db, viewer, ["locked"]),
    ]);
    const followingSet = new Set(followingList.map((h) => norm(h)));
    const requestedSet = new Set(requestedList.map((h) => norm(h)));
    const hiddenSet = new Set(blockedHidden.map((h) => norm(h)));

    // ---- people ----
    const people: {
      handle: string;
      author: string;
      bio: string;
      avatarUrl: string;
      following: boolean;
      requested: boolean;
    }[] = [];
    const seen = new Set<string>();
    const pushPerson = (p: {
      handle?: unknown;
      author?: unknown;
      displayName?: unknown;
      bio?: unknown;
      avatar_url?: unknown;
      avatarUrl?: unknown;
    }) => {
      const handle = withAt(String(p.handle ?? ""));
      const key = norm(handle);
      if (!key || (me && key === me) || seen.has(key) || hiddenSet.has(key)) return;
      seen.add(key);
      people.push({
        handle,
        author: String(p.author || p.displayName || key),
        bio: String(p.bio || "").slice(0, 160),
        avatarUrl: String(p.avatar_url || p.avatarUrl || ""),
        following: followingSet.has(key),
        requested: requestedSet.has(key),
      });
    };
    const [users, profiles] = await Promise.all([
      db
        .collection("users")
        .find({
          suspended: { $ne: true },
          $or: [{ handle: rx }, { displayName: rx }],
        })
        .project({ handle: 1, displayName: 1 })
        .limit(12)
        .toArray(),
      db
        .collection("profiles")
        .find({ $or: [{ handle: rx }, { author: rx }] })
        .project({ handle: 1, author: 1, bio: 1, avatar_url: 1, avatarUrl: 1 })
        .limit(12)
        .toArray(),
    ]);
    for (const u of users) pushPerson({ handle: u.handle, displayName: u.displayName });
    for (const p of profiles) pushPerson(p);

    // ---- takes + hashtags ----
    // Match anywhere in content, and/or the post's declared tags (so #pulse
    // finds posts tagged "pulse" even when their text doesn't spell the tag).
    const posts: SearchPostHit[] = [];
    // Regex can't use an index, so an unmatched query used to read every post.
    // Only the newest SEARCH_SCAN_POSTS are scanned (walking posts_created_id).
    // ponytail: old takes fall out of search; a text/Atlas Search index when that matters.
    const postCandidates = await db
      .collection("posts")
      .aggregate([
        { $sort: { created_at: -1, _id: -1 } },
        { $limit: SEARCH_SCAN_POSTS },
        { $match: { archived: { $ne: true }, $or: [{ content: rx }, { tags: rx }] } },
        { $limit: 40 },
      ])
      .toArray();

    for (const post of postCandidates) {
      const authorKey = norm(String(post.handle ?? ""));
      if (hiddenSet.has(authorKey)) continue;
      if (authorKey === me) {
        // your own takes always surface
      } else if (!(await canViewPosts(db, viewer, String(post.handle ?? "")))) {
        continue;
      }
      posts.push({
        id: String(post._id),
        handle: withAt(String(post.handle ?? "")),
        author: String(post.author || authorKey),
        content: String(post.content ?? "").slice(0, 160),
        media_type: String(post.media_type ?? "text"),
        created_at: post.created_at instanceof Date ? post.created_at.toISOString() : String(post.created_at),
        tags: (Array.isArray(post.tags) ? post.tags : []).slice(0, 8),
      });
      if (posts.length >= 20) break;
    }

    return NextResponse.json({
      people: people.slice(0, 16),
      posts,
      query: q,
    });
  } catch (e) {
    console.error(e);
    reportError(e, { route: "api/search" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}