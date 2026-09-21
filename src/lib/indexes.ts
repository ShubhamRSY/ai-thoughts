import type { Db, ObjectId } from "mongodb";

let ensured = false;

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
    db.collection("users").createIndex(
      { handle: 1 },
      { name: "users_handle" }
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
  }

  ensured = true;
}
