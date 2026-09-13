import type { Db } from "mongodb";
import { feelingOf } from "@/lib/feelings";
import { todayKey, shiftDayKey } from "@/lib/daily-prompt";

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysAgoUtc(n: number): Date {
  const d = startOfUtcDay();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function dayKeyFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface OwnerMetrics {
  generated_at: string;
  totals: {
    users: number;
    posts: number;
    reactions: number;
    replies: number;
    follows: number;
    push_subscriptions: number;
    notifications: number;
  };
  last_7d: {
    new_users: number;
    posts: number;
    unique_posters: number;
    reactions: number;
    replies: number;
    new_follows: number;
  };
  last_30d: {
    new_users: number;
    posts: number;
    unique_posters: number;
  };
  today: {
    posts: number;
    prompt_answers: number;
    unique_posters: number;
    reactions: number;
    replies: number;
  };
  yesterday: {
    posts: number;
    prompt_answers: number;
  };
  trend: {
    posts_wow_pct: number | null;
    users_wow_pct: number | null;
    direction: "up" | "down" | "flat" | "unknown";
  };
  posts_by_day: { day: string; count: number }[];
  feelings_7d: { id: string; short: string; label: string; count: number }[];
  top_posters_7d: { handle: string; author: string; posts: number }[];
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function collectOwnerMetrics(db: Db): Promise<OwnerMetrics> {
  const now = new Date();
  const d7 = daysAgoUtc(7);
  const d14 = daysAgoUtc(14);
  const d30 = daysAgoUtc(30);
  const todayStart = startOfUtcDay(now);
  const yKey = shiftDayKey(todayKey(), -1);
  const tKey = todayKey();

  const posts = db.collection("posts");
  const users = db.collection("users");
  const reactions = db.collection("reactions");
  const messages = db.collection("messages");
  const follows = db.collection("follows");
  const push = db.collection("push_subscriptions");
  const notifications = db.collection("notifications");

  const [
    usersTotal,
    postsTotal,
    reactionsTotal,
    repliesTotal,
    followsTotal,
    pushTotal,
    notifTotal,
    users7,
    users30,
    usersPrev7,
    posts7,
    posts30,
    postsPrev7,
    postsToday,
    postsYesterday,
    promptToday,
    promptYesterday,
    reactions7,
    reactionsToday,
    replies7,
    repliesToday,
    follows7,
  ] = await Promise.all([
    users.countDocuments(),
    posts.countDocuments(),
    reactions.countDocuments(),
    messages.countDocuments(),
    follows.countDocuments(),
    push.countDocuments(),
    notifications.countDocuments(),
    users.countDocuments({
      $or: [
        { createdAt: { $gte: d7.toISOString() } },
        { created_at: { $gte: d7 } },
      ],
    }),
    users.countDocuments({
      $or: [
        { createdAt: { $gte: d30.toISOString() } },
        { created_at: { $gte: d30 } },
      ],
    }),
    users.countDocuments({
      $or: [
        { createdAt: { $gte: d14.toISOString(), $lt: d7.toISOString() } },
        { created_at: { $gte: d14, $lt: d7 } },
      ],
    }),
    posts.countDocuments({ created_at: { $gte: d7 } }),
    posts.countDocuments({ created_at: { $gte: d30 } }),
    posts.countDocuments({ created_at: { $gte: d14, $lt: d7 } }),
    posts.countDocuments({ created_at: { $gte: todayStart } }),
    posts.countDocuments({
      created_at: { $gte: daysAgoUtc(1), $lt: todayStart },
    }),
    posts.countDocuments({ prompt_day: tKey }),
    posts.countDocuments({ prompt_day: yKey }),
    reactions.countDocuments({
      $or: [{ created_at: { $gte: d7 } }, { createdAt: { $gte: d7 } }],
    }),
    reactions.countDocuments({
      $or: [
        { created_at: { $gte: todayStart } },
        { createdAt: { $gte: todayStart } },
      ],
    }),
    messages.countDocuments({
      $or: [{ created_at: { $gte: d7 } }, { createdAt: { $gte: d7 } }],
    }),
    messages.countDocuments({
      $or: [
        { created_at: { $gte: todayStart } },
        { createdAt: { $gte: todayStart } },
      ],
    }),
    follows.countDocuments({
      $or: [
        { created_at: { $gte: d7 } },
        { createdAt: { $gte: d7 } },
      ],
    }),
  ]);

  const uniquePosters7 = await posts.distinct("handle", { created_at: { $gte: d7 } });
  const uniquePosters30 = await posts.distinct("handle", { created_at: { $gte: d30 } });
  const uniquePostersToday = await posts.distinct("handle", {
    created_at: { $gte: todayStart },
  });

  const byDay = await posts
    .aggregate<{ _id: string; count: number }>([
      { $match: { created_at: { $gte: daysAgoUtc(13) } } },
      {
        $group: {
          _id: {
            $dateToString: { format: "%Y-%m-%d", date: "$created_at" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  const posts_by_day: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKeyFromDate(daysAgoUtc(i));
    const found = byDay.find((r) => r._id === key);
    posts_by_day.push({ day: key, count: found?.count ?? 0 });
  }

  const feelingRows = await posts
    .aggregate<{ _id: string; count: number }>([
      {
        $match: {
          created_at: { $gte: d7 },
          feeling: { $exists: true, $nin: [null, ""] },
        },
      },
      { $group: { _id: "$feeling", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();

  const feelings_7d = feelingRows.map((r) => {
    const meta = feelingOf(r._id);
    return {
      id: r._id,
      short: meta?.short ?? r._id,
      label: meta?.label ?? r._id,
      count: r.count,
    };
  });

  const topRows = await posts
    .aggregate<{ _id: string; posts: number; author: string }>([
      { $match: { created_at: { $gte: d7 } } },
      {
        $group: {
          _id: "$handle",
          posts: { $sum: 1 },
          author: { $last: "$author" },
        },
      },
      { $sort: { posts: -1 } },
      { $limit: 8 },
    ])
    .toArray();

  const postsWow = pctChange(posts7, postsPrev7);
  const usersWow = pctChange(users7, usersPrev7);
  let direction: OwnerMetrics["trend"]["direction"] = "unknown";
  if (postsWow === null && usersWow === null) direction = "unknown";
  else {
    const score = (postsWow ?? 0) + (usersWow ?? 0);
    if (score > 5) direction = "up";
    else if (score < -5) direction = "down";
    else direction = "flat";
  }

  return {
    generated_at: now.toISOString(),
    totals: {
      users: usersTotal,
      posts: postsTotal,
      reactions: reactionsTotal,
      replies: repliesTotal,
      follows: followsTotal,
      push_subscriptions: pushTotal,
      notifications: notifTotal,
    },
    last_7d: {
      new_users: users7,
      posts: posts7,
      unique_posters: uniquePosters7.length,
      reactions: reactions7,
      replies: replies7,
      new_follows: follows7,
    },
    last_30d: {
      new_users: users30,
      posts: posts30,
      unique_posters: uniquePosters30.length,
    },
    today: {
      posts: postsToday,
      prompt_answers: promptToday,
      unique_posters: uniquePostersToday.length,
      reactions: reactionsToday,
      replies: repliesToday,
    },
    yesterday: {
      posts: postsYesterday,
      prompt_answers: promptYesterday,
    },
    trend: {
      posts_wow_pct: postsWow,
      users_wow_pct: usersWow,
      direction,
    },
    posts_by_day,
    feelings_7d,
    top_posters_7d: topRows.map((r) => ({
      handle: r._id,
      author: r.author || r._id,
      posts: r.posts,
    })),
  };
}
