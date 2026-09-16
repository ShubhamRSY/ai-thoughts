import type { Db } from "mongodb";

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
    db.collection("notifications").createIndex(
      { recipient_handle: 1, created_at: -1 },
      { name: "notifications_recipient_created" }
    ),
    db.collection("communities").createIndex(
      { slug: 1 },
      { unique: true, name: "communities_slug_unique" }
    ),
    db.collection("community_messages").createIndex(
      { community_slug: 1, created_at: -1 },
      { name: "community_messages_slug_created" }
    ),
    db.collection("reactions").createIndex(
      { post_id: 1, handle_norm: 1, reaction: 1 },
      { unique: true, sparse: true, name: "reactions_post_handle_reaction" }
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

  ensured = true;
}
