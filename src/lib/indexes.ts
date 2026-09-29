import type { Db, ObjectId } from "mongodb";
import { reportError } from "./report-error.ts";

let ensured = false;

/** How long a viewer is remembered before their next view counts again. */
const VIEW_DEDUPE_DAYS = 30;
const ONE_YEAR_S = 60 * 60 * 24 * 365;

/** Idempotent indexes for lookups that matter for auth, prompts, and push. */
export async function ensureCoreIndexes(db: Db): Promise<void> {
  if (ensured) return;

  const jobs: Array<Promise<unknown>> = [
    db.collection("users").createIndex(
      { emailHash: 1 },
      { unique: true, sparse: true, name: "users_emailHash_unique" }
    ),
    db.collection("auth_codes").createIndex(
      { emailHash: 1 },
      { name: "auth_codes_emailHash" }
    ),
    db.collection("posts").createIndex(
      { prompt_day: 1, created_at: -1 },
      { name: "posts_prompt_day_created" }
    ),
    db.collection("posts").createIndex(
      { handle: 1, created_at: -1 },
      { name: "posts_handle_created" }
    ),
    db.collection("posts").createIndex(
      { user_id: 1, created_at: -1 },
      { name: "posts_user_created" }
    ),
    // Main feed: newest-first over all posts. Without it the feed scanned the
    // whole collection on every load (soak test: latency climbed with post count).
    // The _id tiebreak makes "load older" pagination exact for same-ms posts.
    db.collection("posts").createIndex(
      { created_at: -1, _id: -1 },
      { name: "posts_created_id" }
    ),
    // Reply threads + per-post reply counts on every feed page. Without it each
    // feed load was a full scan of every reply ever written.
    db.collection("messages").createIndex(
      { post_id: 1, created_at: 1 },
      { name: "messages_post_created" }
    ),
    db.collection("push_subscriptions").createIndex(
      { endpoint: 1 },
      { unique: true, name: "push_endpoint_unique" }
    ),
    db.collection("push_subscriptions").createIndex(
      { handle: 1 },
      { name: "push_handle" }
    ),
    db.collection("follows").createIndex(
      { follower: 1, following: 1 },
      { unique: true, name: "follows_pair_unique" }
    ),
    db.collection("profiles").createIndex(
      { privacy: 1 },
      { sparse: true, name: "profiles_privacy" }
    ),
    db.collection("blocks").createIndex(
      { blocker: 1, blocked: 1 },
      { unique: true, name: "blocks_pair_unique" }
    ),
    db.collection("blocks").createIndex({ blocked: 1 }, { name: "blocks_blocked" }),
    db.collection("mutes").createIndex(
      { muter: 1, muted: 1 },
      { unique: true, name: "mutes_pair_unique" }
    ),
    db.collection("mutes").createIndex({ muter: 1, created_at: -1 }, { name: "mutes_muter_created" }),
    db.collection("sessions").createIndex({ sid: 1 }, { unique: true, name: "sessions_sid_unique" }),
    db.collection("sessions").createIndex({ user_id: 1 }, { name: "sessions_user" }),
    db.collection("sessions").createIndex(
      { expires_at: 1 },
      { expireAfterSeconds: 0, name: "sessions_ttl" }
    ),
    db.collection("notifications").createIndex(
      { recipient_handle: 1, created_at: -1 },
      { name: "notifications_recipient_created" }
    ),
    // The inbox only shows the latest 40, so notifications older than 90 days are dead weight.
    // Also serves the created_at-sorted scan in GET /api/activity.
    db.collection("notifications").createIndex(
      { created_at: 1 },
      { expireAfterSeconds: 60 * 60 * 24 * 90, name: "notifications_ttl" }
    ),
    db.collection("reactions").createIndex(
      { post_id: 1, handle_norm: 1, reaction: 1 },
      { unique: true, sparse: true, name: "reactions_post_handle_reaction" }
    ),
    db.collection("moods").createIndex(
      { handle_norm: 1, day: 1 },
      { unique: true, name: "moods_handle_day_unique" }
    ),
    // Retention promised in the privacy policy (section 10). Unresolved
    // reports have no resolved_at, so they never expire while open.
    db.collection("security_audit_log").createIndex(
      { created_at: 1 },
      { expireAfterSeconds: ONE_YEAR_S, name: "security_audit_log_ttl" }
    ),
    db.collection("contact_requests").createIndex(
      { created_at: 1 },
      { expireAfterSeconds: ONE_YEAR_S, name: "contact_requests_ttl" }
    ),
    // Child-safety evidence (lib/moderation.ts): each row carries its own expiry.
    db.collection("evidence").createIndex(
      { expires_at: 1 },
      { expireAfterSeconds: 0, name: "evidence_ttl" }
    ),
    db.collection("reports").createIndex(
      { resolved_at: 1 },
      { expireAfterSeconds: ONE_YEAR_S, name: "reports_resolved_ttl" }
    ),
    db.collection("post_views").createIndex(
      { post_id: 1, viewer_key: 1 },
      { unique: true, name: "post_views_post_viewer_unique" }
    ),
  ];

  const results = await Promise.allSettled(jobs);
  for (const r of results) {
    if (r.status === "rejected") {
      const msg = String((r.reason as Error)?.message || r.reason);
      // Index already exists with different options, or duplicate key on unique — log, don't crash health.
      console.warn("ensureCoreIndexes:", msg);
    }
  }

  // Handles are identity (ownership, deletes, mentions all key on them), so two
  // sign-ups racing for the same username must not both get it. Replaces the
  // old non-unique "users_handle" index on the same key.
  try {
    const users = db.collection("users");
    const spec = { handle: 1 } as const;
    const opts = {
      unique: true,
      partialFilterExpression: { handle: { $type: "string" } },
      name: "users_handle_unique",
    };
    try {
      await users.createIndex(spec, opts);
    } catch (e) {
      const code = (e as { code?: number }).code;
      if (code !== 85 && code !== 86) throw e; // IndexOptionsConflict / IndexKeySpecsConflict
      await users.dropIndex("users_handle");
      await users.createIndex(spec, opts);
    }
  } catch (e) {
    // E11000 here means existing duplicate handles — rename one of each pair,
    // then the next health check builds the index.
    console.error("ensureCoreIndexes users_handle_unique:", (e as Error)?.message || e);
    reportError(e, { route: "lib/indexes", service: "mongodb" });
  }

  // One report queue entry per (post, reporter): collapse legacy duplicates
  // first so the unique index can be built, then enforce it going forward.
  // Best-effort — a failure here must not break boot (the report route also
  // guards against duplicates on its own).
  try {
    const reports = db.collection("reports");
    const groups = await reports
      .aggregate<{ ids: ObjectId[] }>([
        {
          $group: {
            _id: { post_id: "$post_id", reporter_handle: "$reporter_handle" },
            ids: { $push: "$_id" },
          },
        },
        { $match: { $expr: { $gt: [{ $size: "$ids" }, 1] } } },
      ])
      .toArray();
    // Keep one row per duplicate group and drop only that group's extras —
    // never touch other groups' rows.
    const surplus = groups.flatMap((g) => g.ids.slice(1));
    if (surplus.length > 0) {
      await reports.deleteMany({ _id: { $in: surplus } });
    }
    await reports.createIndex(
      { post_id: 1, reporter_handle: 1 },
      { unique: true, name: "reports_post_reporter_unique" }
    );
  } catch (e) {
    console.warn("ensureCoreIndexes reports:", (e as Error)?.message || e);
    reportError(e, { route: "lib/indexes", service: "mongodb" });
  }

  // One notification row per (recipient, actor, post, kind) — "arrive exactly
  // once" (see writeActivity's upsert). Collapse legacy duplicates first so the
  // unique index can be built; best-effort, never blocks boot.
  try {
    const notifications = db.collection("notifications");
    const groups = await notifications
      .aggregate<{ ids: ObjectId[]; latest: ObjectId }>([
        {
          $group: {
            _id: {
              recipient_handle: "$recipient_handle",
              actor_handle: "$actor_handle",
              post_id: "$post_id",
              kind: "$kind",
            },
            ids: { $push: "$_id" },
            latest: { $max: "$_id" },
          },
        },
        { $match: { $expr: { $gt: [{ $size: "$ids" }, 1] } } },
      ])
      .toArray();
    const surplus = groups.flatMap((g) => g.ids.filter((id) => !id.equals(g.latest as ObjectId)));
    if (surplus.length > 0) {
      await notifications.deleteMany({ _id: { $in: surplus } });
    }
    await notifications.createIndex(
      { recipient_handle: 1, actor_handle: 1, post_id: 1, kind: 1 },
      { unique: true, name: "notifications_activity_unique" }
    );
  } catch (e) {
    console.warn("ensureCoreIndexes notifications:", (e as Error)?.message || e);
    reportError(e, { route: "lib/indexes", service: "mongodb" });
  }

  // View counts used to be countDocuments over every post_views row ever
  // written, so the collection could never shrink. They now live on the post
  // (posts.view_count) and rows expire after the dedupe window. Before the TTL
  // index exists, copy each post's full row count onto it exactly once.
  try {
    const views = db.collection("post_views");
    const hasTtl = (await views.indexes()).some((i) => i.name === "post_views_ttl");
    if (!hasTtl) {
      await views
        .aggregate([
          { $group: { _id: "$post_id", view_count: { $sum: 1 } } },
          { $match: { _id: { $regex: /^[0-9a-f]{24}$/ } } },
          { $project: { _id: { $toObjectId: "$_id" }, view_count: 1 } },
          { $merge: { into: "posts", on: "_id", whenMatched: "merge", whenNotMatched: "discard" } },
        ], { timeoutMS: 0 })
        .toArray();
      await views.createIndex(
        { created_at: 1 },
        { expireAfterSeconds: 60 * 60 * 24 * VIEW_DEDUPE_DAYS, name: "post_views_ttl" }
      );
    }
  } catch (e) {
    console.warn("ensureCoreIndexes post_views:", (e as Error)?.message || e);
    reportError(e, { route: "lib/indexes", service: "mongodb" });
  }

  ensured = true;
}
