import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { listFollowing, listRequested } from "@/lib/follows";
import { hiddenHandles } from "@/lib/visibility";

function norm(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function withAt(h: string) {
  const n = norm(h);
  return n ? `@${n}` : "";
}

type PersonRow = {
  handle: string;
  author: string;
  bio: string;
  avatarUrl: string;
  following: boolean;
  requested: boolean;
};

/**
 * GET /api/people?q=maya — Instagram-style people search.
 * Empty q returns suggested recent voices (not you).
 */
export async function GET(request: NextRequest) {
  try {
    const ip = clientIp(request);
    const { ok, retryInSec } = await rateLimit(`people-search:${ip}`, 60, 60_000);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many searches — try again shortly", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    const qRaw = request.nextUrl.searchParams.get("q")?.trim() ?? "";
    const q = qRaw.replace(/^@/, "").slice(0, 40);
    const { db } = await connectToDatabase();
    const session = await getSession();
    const me = session ? norm(session.handle) : null;
    const viewer = session?.handle ?? null;
    const [followingList, requestedList, lockedHidden] = await Promise.all([
      viewer ? listFollowing(db, viewer) : [],
      viewer ? listRequested(db, viewer) : [],
      // Locked accounts are invisible to everyone but themselves and followers.
      hiddenHandles(db, viewer, ["locked"]),
    ]);
    const followingSet = new Set(followingList.map((h) => norm(h)));
    const requestedSet = new Set(requestedList.map((h) => norm(h)));
    const lockedSet = new Set(lockedHidden.map((h) => norm(h)));

    const people: PersonRow[] = [];
    const seen = new Set<string>();

    const pushPerson = (p: {
      handle?: string | null;
      author?: string | null;
      bio?: string | null;
      avatar_url?: string | null;
      avatarUrl?: string | null;
      displayName?: string | null;
    }) => {
      const handle = withAt(String(p.handle || ""));
      const key = norm(handle);
      if (!key || (me && key === me) || seen.has(key) || lockedSet.has(key)) return;
      seen.add(key);
      people.push({
        handle,
        author: String(p.author || p.displayName || handle.replace(/^@/, "")),
        bio: String(p.bio || "").slice(0, 160),
        avatarUrl: String(p.avatar_url || p.avatarUrl || ""),
        following: followingSet.has(key),
        requested: requestedSet.has(key),
      });
    };

    if (q.length >= 1) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const rx = new RegExp(safe, "i");

      const [users, profiles] = await Promise.all([
        db
          .collection("users")
          .find({
            suspended: { $ne: true },
            $or: [{ handle: rx }, { displayName: rx }],
          })
          .project({ handle: 1, displayName: 1 })
          .limit(30)
          .toArray(),
        db
          .collection("profiles")
          .find({
            $or: [{ handle: rx }, { author: rx }],
          })
          .project({ handle: 1, author: 1, bio: 1, avatar_url: 1, avatarUrl: 1 })
          .limit(30)
          .toArray(),
      ]);

      for (const u of users) {
        pushPerson({
          handle: u.handle,
          displayName: u.displayName,
          author: u.displayName,
        });
      }
      for (const p of profiles) {
        pushPerson(p);
      }

      // Enrich bios/avatars from profiles
      const handles = people.map((p) => p.handle);
      if (handles.length) {
        const variants = handles.flatMap((h) => [h, norm(h), `@${norm(h)}`]);
        const profileRows = await db
          .collection("profiles")
          .find({ handle: { $in: variants } })
          .project({ handle: 1, author: 1, bio: 1, avatar_url: 1, avatarUrl: 1 })
          .toArray();
        const byKey = new Map(
          profileRows.map((p) => [norm(String(p.handle)), p] as const)
        );
        for (const person of people) {
          const row = byKey.get(norm(person.handle));
          if (!row) continue;
          if (row.author) person.author = String(row.author);
          if (row.bio) person.bio = String(row.bio).slice(0, 160);
          const av = row.avatar_url || row.avatarUrl;
          if (av) person.avatarUrl = String(av);
        }
      }
    } else {
      // Suggestions: recent distinct authors from posts
      const posts = await db
        .collection("posts")
        .find({
          integrity_label: { $ne: "Sample voice" },
        })
        .project({ handle: 1, author: 1 })
        .sort({ created_at: -1 })
        .limit(80)
        .toArray();

      for (const p of posts) {
        pushPerson({ handle: p.handle, author: p.author });
        if (people.length >= 20) break;
      }

      if (people.length < 12) {
        const more = await db
          .collection("users")
          .find({ suspended: { $ne: true } })
          .project({ handle: 1, displayName: 1 })
          .sort({ lastLoginAt: -1 })
          .limit(24)
          .toArray();
        for (const u of more) {
          pushPerson({ handle: u.handle, displayName: u.displayName, author: u.displayName });
          if (people.length >= 20) break;
        }
      }
    }

    return NextResponse.json({
      people: people.slice(0, 24),
      query: q,
    });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
