import { NextRequest, NextResponse, after } from "next/server";
import { createHash } from "crypto";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId, type Document } from "mongodb";
import { getSession } from "@/lib/auth";
import { FEELINGS } from "@/lib/feelings";
import { FEED_PAGE_SIZE } from "@/lib/types";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { checkDignity, normalizeTag } from "@/lib/dignity";
import { GLOBAL_SEED_POSTS } from "@/lib/seed-posts";
import { notifyFollowersOfPost, notifyMentions, notifyPostOwner } from "@/lib/activity";
import { dailyPromptForDay, promptDayKeyUTC } from "@/lib/daily-prompt";
import { setMood } from "@/lib/mood";
import { LIKE_REACTION, BOOST_REACTION, BOOKMARK_REACTION, buildLikedBy } from "@/lib/likes";
import { accountAgeMs, assertCanPost, contentFingerprint, postLimitsForAge } from "@/lib/anti-abuse";
import { extractMentions } from "@/lib/mentions";
import {
  canBeReposted,
  canViewPosts,
  getPrivacy,
  hiddenHandles,
} from "@/lib/visibility";
import { blockedHandles } from "@/lib/blocks";
import { mutedHandles } from "@/lib/mutes";
import { isAllowedMediaUrl, isBlobUrl, isPlayableMediaUrl } from "@/lib/media-sniff";
import { flaggedBody, isFlaggedContent } from "@/lib/content-moderation";
import { checkAttach, claimAttachment, releaseAttachment } from "@/lib/uploads";
import { screenMediaPost } from "@/lib/moderation";
import { signMediaUrl } from "@/lib/media-access";
import { reportError } from "@/lib/report-error";

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function handleVariants(h: string): string[] {
  const n = normHandle(h);
  return Array.from(new Set([h, `@${n}`, n, `@${n}`.toLowerCase()]));
}

// Clients send durations like "0:08", "1:23.45" or bare seconds. Cap the
// claimed value at 10 minutes: anything beyond is nonsense for a 120s
// recorder cap and could mislead playback/QA UIs.
function capMediaDuration(raw: string): string | null {
  const trimmed = raw.trim().slice(0, 12);
  // parse "M:SS(.f)" as m*60 + s when it looks like a colon form
  let seconds = Number.NaN;
  if (trimmed.includes(":")) {
    const parts = trimmed.split(":").map((p) => Number(p));
    if (parts.length === 2 && parts.every(Number.isFinite)) seconds = parts[0] * 60 + parts[1];
  } else {
    const score = parseInt(trimmed.replace(/[^0-9]/g, "").slice(0, 6), 10);
    if (score > 0) seconds = score;
  }
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  if (seconds > 600) return "10:00";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s < 10 ? `${m}:0${s}` : `${m}:${s}`;
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
  author_verified?: boolean | null;
  content: string;
  media_type: "audio" | "video" | "text";
  feeling?: string | null;
  custom_feeling?: string | null;
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
  /** Hidden by automatic screening until a keeper reviews it (lib/moderation.ts). */
  moderation_hold?: boolean;
  /** Unique viewers, bumped by POST /api/posts/[id]/view on each new post_views row. */
  view_count?: number;
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

let lastSeedCheck = 0;
const SEED_CHECK_EVERY_MS = 5 * 60_000;

/** Idempotent: fill any missing global sample takes so the feed never looks empty. */
async function ensureSamplePosts(
  db: Awaited<ReturnType<typeof connectToDatabase>>["db"]
) {
  // Steady state is "nothing missing" — don't spend two DB round trips on it every request.
  if (Date.now() - lastSeedCheck < SEED_CHECK_EVERY_MS) return;
  lastSeedCheck = Date.now();
  try {
    await seedSamplePosts(db);
  } catch (e) {
    lastSeedCheck = 0; // retry on the next request
    throw e;
  }
}

async function seedSamplePosts(
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

    const promptDay = request.nextUrl.searchParams.get("prompt_day")?.trim();
    const handleParam = request.nextUrl.searchParams.get("handle")?.trim();
    const taggedParam = request.nextUrl.searchParams.get("tagged")?.trim();
    // Cursor for "load older": takes strictly older than this ISO timestamp,
    // with an object-id tiebreak so posts sharing the exact same millisecond
    // aren't silently skipped between pages. `before_id` is optional for
    // backward compatibility with callers that only send the time.
    const beforeRaw = request.nextUrl.searchParams.get("before")?.trim();
    const before = beforeRaw ? new Date(beforeRaw) : null;
    if (before && Number.isNaN(before.getTime())) {
      return NextResponse.json({ error: "Invalid before" }, { status: 400 });
    }
    const beforeIdRaw = request.nextUrl.searchParams.get("before_id")?.trim();
    let beforeId: ObjectId | null = null;
    if (beforeIdRaw) {
      try {
        beforeId = new ObjectId(beforeIdRaw);
      } catch {
        return NextResponse.json({ error: "Invalid before_id" }, { status: 400 });
      }
    }

    let filter: Record<string, unknown> = {};
    let limit = FEED_PAGE_SIZE;
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
    // Independent of each other — run together.
    const [session] = await Promise.all([getSession(), ensureSamplePosts(db)]);
    const viewerHandle = session?.handle ?? null;
    // Shared by the author filter, the quote previews and the liked-by list below.
    const blockedP = blockedHandles(db, viewerHandle);
    void blockedP.catch(() => {}); // awaited below; avoids an unhandled rejection if we bail out first
    const mutedP = mutedHandles(db, viewerHandle);
    void mutedP.catch(() => {});
    let hidden: string[] | null = null;
    if (request.nextUrl.searchParams.get("archived") === "1") {
      // The caller's own archive: only ever their own takes, newest first.
      filter = viewerHandle
        ? { handle: { $in: handleVariants(viewerHandle) }, archived: true }
        : { _id: { $in: [] } };
      limit = 100;
    } else {
      const baseHidden = await hiddenHandles(db, viewerHandle, undefined, blockedP);
      // Muted accounts' takes drop out of the feed (one-way, no tie-cutting).
      const muted = await mutedP;
      hidden = baseHidden.concat(muted.filter((m) => !baseHidden.includes(m)));
      const cursorFilter = before
        ? beforeId
          ? {
              $or: [
                { created_at: { $lt: before } },
                { created_at: before, _id: { $lt: beforeId } },
              ],
            }
          : { created_at: { $lt: before } }
        : {};
      filter = {
        $and: [
          filter,
          { archived: { $ne: true } },
          ...(Object.keys(cursorFilter).length ? [cursorFilter] : []),
          ...(hidden.length ? [{ handle: { $nin: hidden } }] : []),
        ],
      };
    }

    const posts = await db
      .collection<PostDoc>("posts")
      .find(filter)
      .sort({ created_at: -1, _id: -1 })
      .limit(limit)
      .toArray();

    const me = session?.handle?.trim().toLowerCase().replace(/^@/, "") ?? null;

    const postIds = posts.map((p) => p._id?.toString() ?? "");

    // Hydrate embedded quote-repost previews. A missing entry (original
    // deleted) just resolves to null — the client shows "removed" instead.
    const quotedIds = [
      ...new Set(posts.map((p) => p.quoted_post_id).filter((v): v is string => Boolean(v))),
    ];
    const quotedObjIds = quotedIds
      .map((id) => {
        try {
          return new ObjectId(id);
        } catch {
          return null;
        }
      })
      .filter((v): v is ObjectId => v !== null);
    const countBy = (collection: string) =>
      postIds.length > 0
        ? db
            .collection(collection)
            .aggregate<{ _id: string; n: number }>([
              { $match: { post_id: { $in: postIds } } },
              { $group: { _id: "$post_id", n: { $sum: 1 } } },
            ])
            .toArray()
        : Promise.resolve([] as { _id: string; n: number }[]);

    // None of these depend on each other — one round trip instead of three.
    const [reactions, quoted, messageRows] = await Promise.all([
      db
        .collection<{
          post_id: string;
          reaction: string;
          handle?: string;
          created_at?: Date;
        }>("reactions")
        .find({ post_id: { $in: postIds } })
        .toArray(),
      quotedObjIds.length > 0
        ? db
            .collection<PostDoc>("posts")
            .find({ _id: { $in: quotedObjIds }, archived: { $ne: true } })
            .project({ handle: 1, author: 1, content: 1, media_type: 1, media_url: 1, feeling: 1 })
            .toArray()
        : Promise.resolve([] as Document[]),
      countBy("messages"),
    ]);

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
    const verifiedByHandle = new Map<string, boolean>();
    if (allHandles.size > 0) {
      const handleVariants = [...allHandles].flatMap((h) => [h, `@${h}`]);
      const users = await db
        .collection<{ handle?: string; displayName?: string; verified?: boolean }>("users")
        .find({ handle: { $in: handleVariants } })
        .project({ handle: 1, displayName: 1, verified: 1 })
        .toArray();
      for (const u of users) {
        if (!u.handle) continue;
        const key = u.handle.trim().toLowerCase().replace(/^@/, "");
        if (u.displayName) nameByHandle.set(key, u.displayName);
        if (u.verified) verifiedByHandle.set(key, true);
      }
    }

    const quotedPostsMap = new Map<
      string,
      {
        id: string;
        handle: string;
        author: string;
        author_verified: boolean;
        content: string;
        media_type: string;
        media_url: string | null;
        feeling: string | null;
      }
    >();
    if (quoted.length > 0) {
      const hiddenSet = new Set(
        (hidden ?? (await hiddenHandles(db, viewerHandle, undefined, blockedP))).map((h) =>
          normHandle(h)
        )
      );
      for (const q of quoted) {
        // A quote of a take this viewer can't see resolves to null, same as a
        // deleted original.
        if (hiddenSet.has(normHandle(String(q.handle)))) continue;
        quotedPostsMap.set(String(q._id), {
          id: String(q._id),
          handle: q.handle,
          author: q.author,
          author_verified: Boolean(verifiedByHandle.get(normHandle(String(q.handle)))),
          content: q.content,
          media_type: q.media_type,
          media_url: q.media_url ?? null,
          feeling: q.feeling ?? null,
        });
      }
    }

    const messageCounts = new Map<string, number>();
    for (const row of messageRows) if (row._id) messageCounts.set(String(row._id), row.n);

    // Identities the viewer may not follow disappear from "liked by": blocked
    // accounts, plus private/locked accounts they don't follow (otherwise a
    // stranger could read a private account's activity through someone else's
    // public post). The counts themselves are left alone.
    const hiddenLikers = new Set(
      (await hiddenHandles(db, viewerHandle, undefined, blockedP)).map(normHandle)
    );

    // Private files only open through a short-lived signed link, handed out
    // here because this viewer passed the visibility filters above.
    const rawUrls = [
      ...posts.flatMap((p) => [p.media_url, p.stream_url]),
      ...[...quotedPostsMap.values()].map((q) => q.media_url),
    ].filter((u): u is string => Boolean(u));
    const signed = new Map(
      await Promise.all(rawUrls.map(async (u) => [u, await signMediaUrl(u)] as const))
    );
    const sign = (u: string | null | undefined) => (u ? signed.get(u) ?? null : null);
    for (const q of quotedPostsMap.values()) q.media_url = sign(q.media_url);

    const result = posts.map((p) => {
      const id = p._id?.toString() ?? "";
      const reacts = reactMap[id] ?? {};
      const rows = rowsByPost[id] ?? [];
      const heartRows = rows.filter((r) => r.reaction === LIKE_REACTION);
      const likedBy = buildLikedBy(
        heartRows.filter((r) => !hiddenLikers.has(normHandle(String(r.handle ?? "")))),
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
        author_verified: verifiedByHandle.get(authorKey) ?? Boolean(p.author_verified),
        content: p.content,
        media_type: p.media_type,
        feeling: p.feeling ?? null,
        custom_feeling: p.custom_feeling ?? null,
        media_url: sign(p.media_url),
        media_duration: p.media_duration ?? null,
        stream_url: sign(p.stream_url),
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
        view_count: p.view_count ?? 0,
        author_joined_at: p.author_joined_at ?? null,
      };
    });

    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/posts" });
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

    const feelingRaw =
      typeof body.feeling === "string" &&
      (FEELING_IDS.has(body.feeling as never) || body.feeling === "custom")
        ? body.feeling
        : null;
    const customFeeling =
      feelingRaw === "custom" && typeof body.custom_feeling === "string"
        ? body.custom_feeling.trim().slice(0, 40)
        : "";
    // A "custom" feeling with nothing typed isn't a real feeling — drop it.
    const feeling = feelingRaw === "custom" && !customFeeling ? null : feelingRaw;
    if (customFeeling) {
      const feelingDignity = checkDignity(customFeeling);
      if (!feelingDignity.ok) {
        return NextResponse.json({ error: feelingDignity.reason }, { status: 400 });
      }
    }

    const tags = Array.isArray(body.tags)
      ? body.tags
          .filter((t: unknown) => typeof t === "string")
          .map((t: string) => normalizeTag(t))
          .filter((t: string | null): t is string => Boolean(t))
          .slice(0, 8)
      : [];

    const { db } = await connectToDatabase();

    let createdAt: string | null = null;
    let verifiedAuthor = Boolean(session.verified);
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
      verifiedAuthor = Boolean((userDoc as { verified?: boolean } | null)?.verified ?? session.verified);
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

    // Media URLs on audio/video takes are validated to Vercel Blob's CDN host.
    // A client could otherwise attach an arbitrary external URL (tracking
    // pixel, phishing link, or a private URL that forces the server/privacy
    // surfaces to interact with an internal host). Image URLs are checked the
    // same way so the entire media surface has one rule.
    const rawMediaUrl = typeof body.media_url === "string" ? body.media_url.trim() : "";
    let mediaUrl: string | null = null;
    let mediaKey: string | null = null;
    // What the moderation API can actually fetch (private-store files need a signed URL).
    let screenUrl: string | null = null;
    if (rawMediaUrl) {
      if (!isAllowedMediaUrl(rawMediaUrl, true)) {
        return NextResponse.json(
          { error: "Media url must point to a Vercel Blob object" },
          { status: 400 }
        );
      }
      // Only a file you uploaded, not yet part of another take — checked
      // before the server fetches anything from the URL (H3). Dev-only sample
      // and localhost media isn't on Blob and has no uploader to check.
      if (isBlobUrl(rawMediaUrl)) {
        const attach = await checkAttach(db, rawMediaUrl, session.id, "take");
        if (!attach.ok) return NextResponse.json({ error: attach.error }, { status: attach.status });
        mediaKey = attach.key;
      }
      // The declared upload type isn't proof; the file's own bytes are.
      const readableUrl = await signMediaUrl(rawMediaUrl);
      if (isBlobUrl(rawMediaUrl) && !(readableUrl && (await isPlayableMediaUrl(readableUrl)))) {
        return NextResponse.json(
          { error: "That file isn't a playable photo, audio, or video — it may be corrupted." },
          { status: 400 }
        );
      }
      mediaUrl = rawMediaUrl;
      screenUrl = readableUrl || rawMediaUrl;
    } else if (mediaType !== "text") {
      return NextResponse.json({ error: "media_url is required" }, { status: 400 });
    }

    // Photo takes are media_type "text" with a media_url; audio/video are
    // screened from their transcript after publishing (screenMediaPost below).
    // The custom feeling is shown as the take's headline, so it's screened with it.
    const screenText = customFeeling ? `${customFeeling}\n${content}` : content;
    if (await isFlaggedContent({ text: screenText, imageUrl: mediaType === "text" ? screenUrl : null })) {
      return NextResponse.json(flaggedBody("take"), { status: 400 });
    }

    // Duration is cosmetic metadata, but cap it so a crafted post can't claim
    // a 999-hour clip and distort UI/playback affordances.
    const rawDuration = typeof body.media_duration === "string" ? body.media_duration.trim() : "";
    const mediaDuration = rawDuration ? capMediaDuration(rawDuration) : null;

    // Integrity is display metadata the client may declare for transparency,
    // but the *verified* flag is server authority: a client can never mark its
    // own post "verified", only the server pipeline (seed/sample) may set that.
    const rawIntegrityHash = typeof body.integrity_hash === "string" ? body.integrity_hash.trim() : "";
    const integrityHash = rawIntegrityHash ? rawIntegrityHash.slice(0, 64) : null;
    const integrityLabel =
      typeof body.integrity_label === "string" ? body.integrity_label.trim().slice(0, 40) : null;

    const doc: PostDoc = {
      user_id: session.id,
      handle: session.handle,
      author: session.displayName || session.handle,
      author_verified: verifiedAuthor,
      content,
      media_type: mediaType as PostDoc["media_type"],
      feeling,
      custom_feeling: feeling === "custom" ? customFeeling : null,
      media_url: mediaUrl,
      media_duration: mediaDuration,
      stream_url: null,
      stream_ready: false,
      tags,
      mentioned_handles: mentionedHandles,
      quoted_post_id: quotedPostId,
      // Echoed to every viewer on every feed load — keep them tag/label sized.
      language: typeof body.language === "string" ? body.language.slice(0, 16) : null,
      language_label: typeof body.language_label === "string" ? body.language_label.slice(0, 40) : null,
      integrity_hash: integrityHash,
      integrity_verified: false, // client claims are never "verified" — server-only
      integrity_label: integrityLabel,
      transcript: null,
      boosts: 0,
      content_fp: contentFingerprint(content),
      author_joined_at: createdAt,
      abuse_flags: abuse.flags ?? [],
      created_at: new Date(),
      ...(promptDay ? { prompt_day: promptDay, prompt_text: promptText } : {}),
    };

    // Double-tapped "Post": both requests pass the cooldown (it reads the last
    // post, which neither has written yet). The limiter's increment is atomic,
    // so only the first identical take in a minute gets through.
    // ponytail: per-instance without Upstash; a unique DB key if taps ever split across instances.
    const { ok: firstTap } = await rateLimit(
      `post-dedupe:${session.id}:${doc.content_fp}:${mediaUrl ?? ""}`,
      1,
      60_000
    );
    if (!firstTap) {
      return NextResponse.json({ error: "That take was already posted", code: "duplicate" }, { status: 409 });
    }
    // Bind the file to this post first, atomically: two posts racing for one
    // upload can't both get it.
    const newId = new ObjectId();
    if (mediaKey && !(await claimAttachment(db, mediaKey, session.id, newId))) {
      return NextResponse.json({ error: "That file is already part of another take" }, { status: 409 });
    }
    let result;
    try {
      result = await db.collection<PostDoc>("posts").insertOne({ ...doc, _id: newId });
    } catch (e) {
      if (mediaKey) await releaseAttachment(db, mediaKey, newId);
      throw e;
    }
    // assertCanPost counts, then we insert — parallel requests all saw the same
    // count. Settle the race against what actually landed: if another post of
    // this author's, created before ours (lower _id), is inside the cooldown,
    // ours loses and is rolled back. One survivor per window also holds the
    // daily cap (e.g. 1 take in the first hour). Reads real rows, so undoing
    // a take still frees the slot exactly as before.
    const cooldownMs = postLimitsForAge(accountAgeMs(createdAt)).cooldownMs;
    const raced = await db.collection("posts").findOne(
      { user_id: session.id, _id: { $lt: newId }, created_at: { $gte: new Date(Date.now() - cooldownMs) } },
      { projection: { _id: 1 } }
    );
    if (raced) {
      await db.collection("posts").deleteOne({ _id: newId });
      if (mediaKey) await releaseAttachment(db, mediaKey, newId);
      return NextResponse.json({ error: "cooldown", retry_in_sec: Math.ceil(cooldownMs / 1000) }, { status: 429 });
    }
    const postId = result.insertedId.toString();
    if (mediaUrl && mediaType !== "text") {
      const insertedId = result.insertedId;
      after(() =>
        screenMediaPost(db, insertedId, mediaUrl).catch((e) =>
          reportError(e, { route: "api/posts", service: "openai" })
        )
      );
    }
    if (feeling) {
      await setMood(db, session.handle, promptDay ?? promptDayKeyUTC(), feeling, "post").catch(() => {});
    }

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
        after(() =>
          notifyPostOwner(db, {
            postId: quotedPostId,
            actorHandle: storeHandle,
            actorAuthor: session.displayName || session.handle,
            kind: "reaction",
            preview: BOOST_REACTION,
          }).catch((e) => reportError(e, { route: "api/posts" }))
        );
      }
    }

    // Don't block the response on fan-out
    after(() =>
      notifyFollowersOfPost(db, {
        postId,
        authorHandle: session.handle,
        authorName: session.displayName || session.handle,
        preview: content,
      }).catch((e) => reportError(e, { route: "api/posts" }))
    );
    if (mentionedHandles.length) {
      after(() =>
        notifyMentions(db, {
          postId,
          actorHandle: session.handle,
          actorAuthor: session.displayName || session.handle,
          preview: content,
          mentioned: mentionedHandles,
        }).catch((e) => reportError(e, { route: "api/posts" }))
      );
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
          media_url: await signMediaUrl(orig.media_url),
          feeling: orig.feeling ?? null,
        };
      }
    }

    return NextResponse.json({
      id: postId,
      ...doc,
      media_url: await signMediaUrl(doc.media_url),
      created_at: doc.created_at.toISOString(),
      reactions: [],
      quoted_post: quotedPostPreview,
    });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/posts" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
