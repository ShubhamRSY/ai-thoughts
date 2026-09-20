import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import { getSession } from "@/lib/auth";
import { FEELINGS } from "@/lib/feelings";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { checkDignity, normalizeTag } from "@/lib/dignity";
import { GLOBAL_SEED_POSTS } from "@/lib/seed-posts";
import { notifyFollowersOfPost, notifyMentions, notifyPostOwner } from "@/lib/activity";
import { dailyPromptForDay, promptDayKeyUTC } from "@/lib/daily-prompt";
import { LIKE_REACTION, BOOST_REACTION, BOOKMARK_REACTION, buildLikedBy } from "@/lib/likes";
import { assertCanPost, contentFingerprint } from "@/lib/anti-abuse";
import { extractMentions } from "@/lib/mentions";
import {
  canBeReposted,
  canViewPosts,
  getPrivacy,
  hiddenAuthorFilter,
  hiddenHandles,
} from "@/lib/visibility";
import { blockedHandles } from "@/lib/blocks";

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function handleVariants(h: string): string[] {
  const n = normHandle(h);
  return Array.from(new Set([h, `@${n}`, n, `@${n}`.toLowerCase()]));
}

const MEDIA_TYPES = new Set(["audio", "video", "text"]);
const FEELING_IDS = new Set(FEELINGS.map((f) => f.id));
const MAX_CONTENT_LENGTH = 500;
const IP_POST_LIMIT = 20;
const IP_POST_WINDOW_MS = 10 * 60_000;

interface PostDoc {
  _id?: ObjectId;
  user_id?: string;
  handle: string;
  author: string;
  content: string;
  media_type: "audio" | "video" | "text";
  feeling?: string | null;
  media_url?: string | null;
  media_duration?: string | null;
  stream_url?: string | null;
  stream_ready?: boolean;
  tags: string[];
  language?: string | null;
  language_label?: string | null;
  integrity_hash?: string | null;
  integrity_verified?: boolean | null;
  integrity_label?: string | null;
  transcript?: unknown;
  boosts?: number;
  /** Real registered handles @mentioned in this take's own content (not replies). */
  mentioned_handles?: string[];
  /** Set when this take is a quote-repost — the original take's _id as a string. */
  quoted_post_id?: string | null;
  /** Author-hidden: visible to the author only (see canViewPost). */
  archived?: boolean;
  archived_at?: Date;
  content_fp?: string;
  author_joined_at?: string | null;
  abuse_flags?: string[];
  created_at: Date;
  seed_id?: string;
  prompt_day?: string;
  prompt_text?: string;
}

function hash(s: string) {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

/** Idempotent: fill any missing global sample takes so the feed never looks empty. */
async function ensureSamplePosts(
  db: Awaited<ReturnType<typeof connectToDatabase>>["db"]
) {
  try {
    await db.collection("posts").createIndex({ seed_id: 1 }, { unique: true, sparse: true });
  } catch {
    /* index may already exist */
  }

  const ids = GLOBAL_SEED_POSTS.map((p) => p.seed_id);
  const existing = await db
    .collection("posts")
    .find({ seed_id: { $in: ids } }, { projection: { seed_id: 1 } })
    .toArray();
  const have = new Set(existing.map((p) => p.seed_id as string));
  const missing = GLOBAL_SEED_POSTS.filter((p) => !have.has(p.seed_id));
  if (missing.length === 0) return;

  await db.collection("posts").insertMany(
    missing.map((p) => ({
      seed_id: p.seed_id,
      handle: p.handle,
      author: p.author,
      content: p.content,
      media_type: "text" as const,
      feeling: p.feeling,
      tags: p.tags,
      language: p.language,
      language_label: p.language_label,
      integrity_hash: hash(`${p.seed_id}:${p.handle}:${p.content}`),
      integrity_verified: false,
      integrity_label: "Sample voice",
      is_seed: true,
      created_at: new Date(Date.now() - p.hours * 3600e3),
      user_id: new ObjectId().toString(),
      boosts: 0,
    }))
  );

  // Relabel any legacy seed rows that still look “Verified”.
  await db.collection("posts").updateMany(
    {
      $or: [{ seed_id: { $exists: true, $ne: null } }, { is_seed: true }],
      integrity_label: { $ne: "Sample voice" },
    },
    { $set: { integrity_verified: false, integrity_label: "Sample voice", is_seed: true } }
  );

  // Drop the original untagged 3 demos if they still sit beside seeded copies
  await db.collection("posts").deleteMany({
    seed_id: { $exists: false },
    handle: { $in: ["@maravoss", "@dexbuilds", "@priyathinks"] },
  });
}

export async function GET(request: NextRequest) {
  try {
    const { db } = await connectToDatabase();
    await ensureSamplePosts(db);

    const promptDay = request.nextUrl.searchParams.get("prompt_day")?.trim();
    const handleParam = request.nextUrl.searchParams.get("handle")?.trim();
    const taggedParam = request.nextUrl.searchParams.get("tagged")?.trim();

    let filter: Record<string, unknown> = {};
    let limit = 40;
    if (handleParam) {
      filter = { handle: { $in: handleVariants(handleParam) } };
      limit = 200;
    } else if (taggedParam) {
      filter = { mentioned_handles: normHandle(taggedParam) };
      limit = 200;
    } else if (promptDay) {
      filter = { prompt_day: promptDay };
      limit = 60;
    }
    const session = await getSession();
    const viewerHandle = session?.handle ?? null;
    if (request.nextUrl.searchParams.get("archived") === "1") {
      // The caller's own archive: only ever their own takes, newest first.
      filter = viewerHandle
        ? { handle: { $in: handleVariants(viewerHandle) }, archived: true }
        : { _id: { $in: [] } };
      limit = 100;
    } else {
      const hiddenFilter = await hiddenAuthorFilter(db, viewerHandle);
      filter = {
        $and: [
          filter,
          { archived: { $ne: true } },
          ...(Object.keys(hiddenFilter).length ? [hiddenFilter] : []),
        ],
      };
    }

    const posts = await db
      .collection<PostDoc>("posts")
      .find(filter)
      .sort({ created_at: -1 })
      .limit(limit)
      .toArray();

    const me = session?.handle?.trim().toLowerCase().replace(/^@/, "") ?? null;

    const postIds = posts.map((p) => p._id?.toString() ?? "");
    const reactions = await db
      .collection<{
        post_id: string;
        reaction: string;
        handle?: string;
        created_at?: Date;
      }>("reactions")
      .find({ post_id: { $in: postIds } })
      .toArray();

    const reactMap: Record<string, Record<string, number>> = {};
    const rowsByPost: Record<
      string,
      { handle?: string; reaction?: string; created_at?: Date }[]
    > = {};
    const allHandles = new Set<string>();
    for (const r of reactions) {
      if (!reactMap[r.post_id]) reactMap[r.post_id] = {};
      reactMap[r.post_id][r.reaction] = (reactMap[r.post_id][r.reaction] ?? 0) + 1;
      if (!rowsByPost[r.post_id]) rowsByPost[r.post_id] = [];
      rowsByPost[r.post_id].push(r);
      if (r.handle) allHandles.add(r.handle.trim().toLowerCase().replace(/^@/, ""));
    }

    for (const p of posts) {
      if (p.handle) allHandles.add(String(p.handle).trim().toLowerCase().replace(/^@/, ""));
    }

    const nameByHandle = new Map<string, string>();
    if (allHandles.size > 0) {
      const handleVariants = [...allHandles].flatMap((h) => [h, `@${h}`]);
      const users = await db
        .collection<{ handle?: string; displayName?: string }>("users")
        .find({ handle: { $in: handleVariants } })
        .project({ handle: 1, displayName: 1 })
        .toArray();
      for (const u of users) {
        if (!u.handle) continue;
        const key = u.handle.trim().toLowerCase().replace(/^@/, "");
        if (u.displayName) nameByHandle.set(key, u.displayName);
      }
    }

    // Hydrate embedded quote-repost previews. A missing entry (original
    // deleted) just resolves to null — the client shows "removed" instead.
    const quotedIds = [
      ...new Set(posts.map((p) => p.quoted_post_id).filter((v): v is string => Boolean(v))),
    ];
    const quotedPostsMap = new Map<
      string,
      {
        id: string;
        handle: string;
        author: string;
        content: string;
        media_type: string;
        media_url: string | null;
        feeling: string | null;
      }
    >();
    if (quotedIds.length > 0) {
      const objIds = quotedIds
        .map((id) => {
          try {
            return new ObjectId(id);
          } catch {
            return null;
          }
        })
        .filter((v): v is ObjectId => v !== null);
      const quoted = await db
        .collection<PostDoc>("posts")
        .find({ _id: { $in: objIds }, archived: { $ne: true } })
        .project({ handle: 1, author: 1, content: 1, media_type: 1, media_url: 1, feeling: 1 })
        .toArray();
      const hiddenSet = new Set(
        (await hiddenHandles(db, viewerHandle)).map((h) => normHandle(h))
      );
      for (const q of quoted) {
        // A quote of a take this viewer can't see resolves to null, same as a
        // deleted original.
        if (hiddenSet.has(normHandle(String(q.handle)))) continue;
        quotedPostsMap.set(String(q._id), {
          id: String(q._id),
          handle: q.handle,
          author: q.author,
          content: q.content,
          media_type: q.media_type,
          media_url: q.media_url ?? null,
          feeling: q.feeling ?? null,
        });
      }
    }

    const messageCounts = new Map<string, number>();
    const viewCounts = new Map<string, number>();
    if (postIds.length > 0) {
      const counts = await db
        .collection("messages")
        .aggregate<{ _id: string; n: number }>([
          { $match: { post_id: { $in: postIds } } },
          { $group: { _id: "$post_id", n: { $sum: 1 } } },
        ])
        .toArray();
      for (const row of counts) {
        if (row._id) messageCounts.set(String(row._id), row.n);
      }

      const views = await db
        .collection("post_views")
        .aggregate<{ _id: string; n: number }>([
          { $match: { post_id: { $in: postIds } } },
          { $group: { _id: "$post_id", n: { $sum: 1 } } },
        ])
        .toArray();
      for (const row of views) {
        if (row._id) viewCounts.set(String(row._id), row.n);
      }
    }

    // Names of blocked users are dropped from "liked by"; the counts are left alone.
    const blockedSet = new Set((await blockedHandles(db, viewerHandle)).map(normHandle));

    const result = posts.map((p) => {
      const id = p._id?.toString() ?? "";
      const reacts = reactMap[id] ?? {};
      const rows = rowsByPost[id] ?? [];
      const heartRows = rows.filter((r) => r.reaction === LIKE_REACTION);
      const likedBy = buildLikedBy(
        heartRows.filter((r) => !blockedSet.has(normHandle(String(r.handle ?? "")))),
        nameByHandle,
        5
      );
      const unique = new Set(
        heartRows
          .map((r) => r.handle?.trim().toLowerCase().replace(/^@/, ""))
          .filter(Boolean) as string[]
      );
      const likedByMe = Boolean(
        me &&
          heartRows.some((r) => r.handle?.trim().toLowerCase().replace(/^@/, "") === me)
      );
      const boostRows = rows.filter((r) => r.reaction === BOOST_REACTION);
      const boostCount = new Set(
        boostRows.map((r) => r.handle?.trim().toLowerCase().replace(/^@/, "")).filter(Boolean)
      ).size;
      const boostedByMe = Boolean(
        me && boostRows.some((r) => r.handle?.trim().toLowerCase().replace(/^@/, "") === me)
      );
      const bookmarkedByMe = Boolean(
        me &&
          rows.some(
            (r) =>
              r.reaction === BOOKMARK_REACTION &&
              r.handle?.trim().toLowerCase().replace(/^@/, "") === me
          )
      );
      const authorKey = String(p.handle || "")
        .trim()
        .toLowerCase()
        .replace(/^@/, "");
      const liveAuthor = nameByHandle.get(authorKey);
      return {
        id,
        handle: p.handle,
        author: liveAuthor || p.author || p.handle.replace(/^@/, ""),
        content: p.content,
        media_type: p.media_type,
        feeling: p.feeling ?? null,
        media_url: p.media_url ?? null,
        media_duration: p.media_duration ?? null,
        stream_url: p.stream_url ?? null,
        stream_ready: Boolean(p.stream_ready),
        tags: p.tags ?? [],
        language: p.language ?? null,
        language_label: p.language_label ?? null,
        integrity_hash: p.integrity_hash ?? null,
        integrity_verified: Boolean(p.integrity_verified),
        integrity_label: p.integrity_label ?? null,
        transcript: p.transcript ?? null,
        quoted_post_id: p.quoted_post_id ?? null,
        quoted_post: p.quoted_post_id ? quotedPostsMap.get(p.quoted_post_id) ?? null : null,
        prompt_day: p.prompt_day ?? null,
        prompt_text: p.prompt_text ?? null,
        created_at:
          p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at),
        reactions: Object.entries(reacts).map(([type, count]) => ({ type, count })),
        liked_by: likedBy,
        like_count: unique.size,
        liked_by_me: likedByMe,
        reply_count: messageCounts.get(id) ?? 0,
        boost_count: boostCount,
        boosted_by_me: boostedByMe,
        bookmarked_by_me: bookmarkedByMe,
        view_count: viewCounts.get(id) ?? 0,
        author_joined_at: p.author_joined_at ?? null,
      };
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

    const ip = clientIp(request);
    const { ok: ipOk } = await rateLimit(`post:${ip}`, IP_POST_LIMIT, IP_POST_WINDOW_MS);
    if (!ipOk) {
      return NextResponse.json({ error: "Too many posts — slow down" }, { status: 429 });
    }

    const body = await request.json();

    const content = typeof body.content === "string" ? body.content.trim() : "";
    if (!content) {
      return NextResponse.json({ error: "Content is required" }, { status: 400 });
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return NextResponse.json(
        { error: `Content must be ${MAX_CONTENT_LENGTH} characters or fewer` },
        { status: 400 }
      );
    }

    const dignity = checkDignity(content);
    if (!dignity.ok) {
      return NextResponse.json({ error: dignity.reason }, { status: 400 });
    }

    const mediaType = typeof body.media_type === "string" ? body.media_type : "text";
    if (!MEDIA_TYPES.has(mediaType)) {
      return NextResponse.json({ error: "Invalid media_type" }, { status: 400 });
    }

    const feeling =
      typeof body.feeling === "string" && FEELING_IDS.has(body.feeling as never)
        ? body.feeling
        : null;

    const tags = Array.isArray(body.tags)
      ? body.tags
          .filter((t: unknown) => typeof t === "string")
          .map((t: string) => normalizeTag(t))
          .filter((t: string | null): t is string => Boolean(t))
          .slice(0, 8)
      : [];

    const { db } = await connectToDatabase();

    let createdAt: string | null = null;
    try {
      const userDoc = await db.collection("users").findOne({
        _id: new ObjectId(session.id),
      });
      const raw =
        (userDoc as { createdAt?: string; created_at?: string | Date } | null)?.createdAt ??
        (userDoc as { created_at?: string | Date } | null)?.created_at ??
        null;
      createdAt =
        raw instanceof Date ? raw.toISOString() : typeof raw === "string" ? raw : null;
    } catch {
      createdAt = null;
    }

    const abuse = await assertCanPost(db, {
      userId: session.id,
      handle: session.handle,
      content,
      createdAt,
    });
    if (!abuse.ok) {
      if (abuse.code === "cooldown") {
        return NextResponse.json(
          {
            error: "cooldown",
            retry_in_sec: abuse.retryInSec ?? 60,
          },
          { status: 429 }
        );
      }
      return NextResponse.json({ error: abuse.reason, code: abuse.code }, { status: 400 });
    }

    const fromDaily =
      body.from_daily_prompt === true ||
      (typeof body.prompt_day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.prompt_day));
    const promptDay = fromDaily
      ? typeof body.prompt_day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.prompt_day)
        ? body.prompt_day
        : promptDayKeyUTC()
      : undefined;
    const promptText = promptDay
      ? typeof body.prompt_text === "string" && body.prompt_text.trim()
        ? body.prompt_text.trim().slice(0, 280)
        : dailyPromptForDay(promptDay)
      : undefined;

    // Only tag real registered users — never store an arbitrary @string as a
    // "tagged" mention just because someone typed it.
    const rawMentions = extractMentions(content);
    let mentionedHandles: string[] = [];
    if (rawMentions.length) {
      const variants = rawMentions.flatMap((h) => [h, `@${h}`]);
      const matched = await db
        .collection("users")
        .find({ handle: { $in: variants } })
        .project({ handle: 1 })
        .toArray();
      const matchedSet = new Set(matched.map((u) => normHandle(String(u.handle))));
      mentionedHandles = rawMentions.filter((h) => matchedSet.has(h));
    }

    // A quote-repost references another take by id — validate the id shape
    // only; a since-deleted original is handled gracefully at read time.
    let quotedPostId: string | null = null;
    if (typeof body.quoted_post_id === "string" && body.quoted_post_id.trim()) {
      try {
        quotedPostId = new ObjectId(body.quoted_post_id.trim()).toString();
      } catch {
        quotedPostId = null;
      }
    }

    if (quotedPostId) {
      const orig = await db
        .collection<PostDoc>("posts")
        .findOne({ _id: new ObjectId(quotedPostId) }, { projection: { handle: 1, archived: 1 } });
      if (
        orig &&
        (orig.archived === true ||
          !canBeReposted(await getPrivacy(db, String(orig.handle))) ||
          !(await canViewPosts(db, session.handle, String(orig.handle))))
      ) {
        return NextResponse.json({ error: "This take can't be quoted" }, { status: 403 });
      }
    }

    const doc: PostDoc = {
      user_id: session.id,
      handle: session.handle,
      author: session.displayName || session.handle,
      content,
      media_type: mediaType as PostDoc["media_type"],
      feeling,
      media_url: typeof body.media_url === "string" ? body.media_url : null,
      media_duration: typeof body.media_duration === "string" ? body.media_duration : null,
      stream_url: null,
      stream_ready: false,
      tags,
      mentioned_handles: mentionedHandles,
      quoted_post_id: quotedPostId,
      language: typeof body.language === "string" ? body.language : null,
      language_label: typeof body.language_label === "string" ? body.language_label : null,
      integrity_hash: typeof body.integrity_hash === "string" ? body.integrity_hash : null,
      integrity_verified: Boolean(body.integrity_verified),
      integrity_label: typeof body.integrity_label === "string" ? body.integrity_label : null,
      transcript: null,
      boosts: 0,
      content_fp: contentFingerprint(content),
      author_joined_at: createdAt,
      abuse_flags: abuse.flags ?? [],
      created_at: new Date(),
      ...(promptDay ? { prompt_day: promptDay, prompt_text: promptText } : {}),
    };

    const result = await db.collection<PostDoc>("posts").insertOne(doc);
    const postId = result.insertedId.toString();

    // A quote-repost is a repost — keep boost count / boostedByMe / the
    // Reposts profile tab in sync with what a plain repost would do.
    if (quotedPostId) {
      const variants = handleVariants(session.handle);
      const storeHandle = `@${normHandle(session.handle)}`;
      const existingRepost = await db.collection("reactions").findOne({
        post_id: quotedPostId,
        handle: { $in: variants },
        reaction: BOOST_REACTION,
      });
      if (!existingRepost) {
        await db.collection("reactions").insertOne({
          post_id: quotedPostId,
          handle: storeHandle,
          handle_norm: normHandle(session.handle),
          reaction: BOOST_REACTION,
          created_at: new Date(),
        });
        void notifyPostOwner(db, {
          postId: quotedPostId,
          actorHandle: storeHandle,
          actorAuthor: session.displayName || session.handle,
          kind: "reaction",
          preview: BOOST_REACTION,
        });
      }
    }

    // Don't block the response on fan-out
    void notifyFollowersOfPost(db, {
      postId,
      authorHandle: session.handle,
      authorName: session.displayName || session.handle,
      preview: content,
    });
    if (mentionedHandles.length) {
      void notifyMentions(db, {
        postId,
        actorHandle: session.handle,
        actorAuthor: session.displayName || session.handle,
        preview: content,
        mentioned: mentionedHandles,
      });
    }

    let quotedPostPreview: {
      id: string;
      handle: string;
      author: string;
      content: string;
      media_type: string;
      media_url: string | null;
      feeling: string | null;
    } | null = null;
    if (quotedPostId) {
      const orig = await db.collection<PostDoc>("posts").findOne(
        { _id: new ObjectId(quotedPostId) },
        { projection: { handle: 1, author: 1, content: 1, media_type: 1, media_url: 1, feeling: 1 } }
      );
      if (orig) {
        quotedPostPreview = {
          id: quotedPostId,
          handle: orig.handle,
          author: orig.author,
          content: orig.content,
          media_type: orig.media_type,
          media_url: orig.media_url ?? null,
          feeling: orig.feeling ?? null,
        };
      }
    }

    return NextResponse.json({
      id: postId,
      ...doc,
      created_at: doc.created_at.toISOString(),
      reactions: [],
      quoted_post: quotedPostPreview,
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
