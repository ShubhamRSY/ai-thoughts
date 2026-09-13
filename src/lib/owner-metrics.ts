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

function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function ratio(n: number, d: number): number {
  if (d <= 0) return 0;
  return Math.round((n / d) * 1000) / 10;
}

export interface OwnerMetrics {
  generated_at: string;
  health: {
    score: number;
    grade: "A" | "B" | "C" | "D" | "F";
    label: string;
    summary: string;
  };
  insights: string[];
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
    returning_posters: number;
    reactions: number;
    replies: number;
    new_follows: number;
    prompt_answers: number;
  };
  prior_7d: {
    new_users: number;
    posts: number;
    unique_posters: number;
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
    reactions: number;
    replies: number;
  };
  rates: {
    reactions_per_post_7d: number;
    replies_per_post_7d: number;
    poster_share_of_users_7d: number;
    prompt_share_of_posts_7d: number;
    push_opt_in_pct: number;
    posts_dod_pct: number | null;
  };
  funnel_7d: {
    users: number;
    posters: number;
    engaged: number;
  };
  media_7d: { type: string; count: number; pct: number }[];
  trend: {
    posts_wow_pct: number | null;
    users_wow_pct: number | null;
    posters_wow_pct: number | null;
    engagement_wow_pct: number | null;
    direction: "up" | "down" | "flat" | "unknown";
  };
  posts_by_day: { day: string; count: number }[];
  users_by_day: { day: string; count: number }[];
  feelings_7d: {
    id: string;
    short: string;
    label: string;
    count: number;
    pct: number;
  }[];
  top_posters_7d: { handle: string; author: string; posts: number }[];
}

function buildInsights(m: Omit<OwnerMetrics, "insights" | "health">): {
  insights: string[];
  health: OwnerMetrics["health"];
} {
  const insights: string[] = [];
  let score = 50;

  if ((m.trend.posts_wow_pct ?? 0) > 10) {
    score += 15;
    insights.push(
      `Takes are up ${m.trend.posts_wow_pct}% week-over-week — creation momentum is healthy.`
    );
  } else if ((m.trend.posts_wow_pct ?? 0) < -10) {
    score -= 15;
    insights.push(
      `Takes are down ${Math.abs(m.trend.posts_wow_pct!)}% vs last week — prompt or invite push may help.`
    );
  }

  if ((m.trend.users_wow_pct ?? 0) > 10) {
    score += 10;
    insights.push(`New users up ${m.trend.users_wow_pct}% WoW.`);
  } else if ((m.trend.users_wow_pct ?? 0) < -10) {
    score -= 8;
    insights.push(`New signups slowed (${m.trend.users_wow_pct}% WoW).`);
  }

  if (m.rates.reactions_per_post_7d >= 1) {
    score += 12;
    insights.push(
      `Warmth is working: ${m.rates.reactions_per_post_7d} reactions per take (7d).`
    );
  } else if (m.last_7d.posts > 0 && m.rates.reactions_per_post_7d < 0.3) {
    score -= 12;
    insights.push(
      `Takes are getting few reactions (${m.rates.reactions_per_post_7d}/post). Same-day responds will lift retention.`
    );
  }

  if (m.rates.prompt_share_of_posts_7d >= 40) {
    score += 8;
    insights.push(
      `${m.rates.prompt_share_of_posts_7d}% of takes answer the daily prompt — ritual is sticking.`
    );
  } else if (m.last_7d.posts > 5 && m.rates.prompt_share_of_posts_7d < 15) {
    score -= 5;
    insights.push(
      `Only ${m.rates.prompt_share_of_posts_7d}% of takes are prompt answers — surface Today’s prompt more.`
    );
  }

  if (m.last_7d.returning_posters >= 2) {
    score += 10;
    insights.push(
      `${m.last_7d.returning_posters} people posted on 2+ days this week — early habit signal.`
    );
  }

  if (m.today.posts === 0 && m.yesterday.posts > 0) {
    score -= 5;
    insights.push("No takes yet today — share today’s prompt in your circle.");
  } else if (m.today.posts > m.yesterday.posts && m.yesterday.posts > 0) {
    score += 5;
    insights.push(
      `Today is ahead of yesterday (${m.today.posts} vs ${m.yesterday.posts} takes).`
    );
  }

  if (m.feelings_7d[0]) {
    insights.push(
      `Dominant feeling (7d): ${m.feelings_7d[0].short} — “${m.feelings_7d[0].label}” (${m.feelings_7d[0].pct}%).`
    );
  }

  if (insights.length === 0) {
    insights.push("Not enough activity yet for deep trends — keep seeding first voices.");
  }

  score = Math.max(0, Math.min(100, score));
  const grade: OwnerMetrics["health"]["grade"] =
    score >= 85 ? "A" : score >= 70 ? "B" : score >= 55 ? "C" : score >= 40 ? "D" : "F";
  const label =
    grade === "A"
      ? "Strong"
      : grade === "B"
        ? "Healthy"
        : grade === "C"
          ? "Building"
          : grade === "D"
            ? "Soft"
            : "Quiet";
  const summary =
    m.trend.direction === "up"
      ? "Overall trajectory is up."
      : m.trend.direction === "down"
        ? "Overall trajectory is down."
        : m.trend.direction === "flat"
          ? "Overall trajectory is flat."
          : "Need more history for a clear trajectory.";

  return { insights: insights.slice(0, 6), health: { score, grade, label, summary } };
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
    prompt7,
    reactions7,
    reactionsPrev7,
    reactionsToday,
    reactionsYesterday,
    replies7,
    repliesPrev7,
    repliesToday,
    repliesYesterday,
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
    posts.countDocuments({
      created_at: { $gte: d7 },
      prompt_day: { $exists: true, $nin: [null, ""] },
    }),
    reactions.countDocuments({
      $or: [{ created_at: { $gte: d7 } }, { createdAt: { $gte: d7 } }],
    }),
    reactions.countDocuments({
      $or: [
        { created_at: { $gte: d14, $lt: d7 } },
        { createdAt: { $gte: d14, $lt: d7 } },
      ],
    }),
    reactions.countDocuments({
      $or: [
        { created_at: { $gte: todayStart } },
        { createdAt: { $gte: todayStart } },
      ],
    }),
    reactions.countDocuments({
      $or: [
        { created_at: { $gte: daysAgoUtc(1), $lt: todayStart } },
        { createdAt: { $gte: daysAgoUtc(1), $lt: todayStart } },
      ],
    }),
    messages.countDocuments({
      $or: [{ created_at: { $gte: d7 } }, { createdAt: { $gte: d7 } }],
    }),
    messages.countDocuments({
      $or: [
        { created_at: { $gte: d14, $lt: d7 } },
        { createdAt: { $gte: d14, $lt: d7 } },
      ],
    }),
    messages.countDocuments({
      $or: [
        { created_at: { $gte: todayStart } },
        { createdAt: { $gte: todayStart } },
      ],
    }),
    messages.countDocuments({
      $or: [
        { created_at: { $gte: daysAgoUtc(1), $lt: todayStart } },
        { createdAt: { $gte: daysAgoUtc(1), $lt: todayStart } },
      ],
    }),
    follows.countDocuments({
      $or: [{ created_at: { $gte: d7 } }, { createdAt: { $gte: d7 } }],
    }),
  ]);

  const uniquePosters7 = await posts.distinct("handle", { created_at: { $gte: d7 } });
  const uniquePostersPrev7 = await posts.distinct("handle", {
    created_at: { $gte: d14, $lt: d7 },
  });
  const uniquePosters30 = await posts.distinct("handle", { created_at: { $gte: d30 } });
  const uniquePostersToday = await posts.distinct("handle", {
    created_at: { $gte: todayStart },
  });

  const returningAgg = await posts
    .aggregate<{ _id: string; days: number }>([
      { $match: { created_at: { $gte: d7 } } },
      {
        $group: {
          _id: {
            handle: "$handle",
            day: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
          },
        },
      },
      { $group: { _id: "$_id.handle", days: { $sum: 1 } } },
      { $match: { days: { $gte: 2 } } },
    ])
    .toArray();

  const byDay = await posts
    .aggregate<{ _id: string; count: number }>([
      { $match: { created_at: { $gte: daysAgoUtc(13) } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  const posts_by_day: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKeyFromDate(daysAgoUtc(i));
    posts_by_day.push({
      day: key,
      count: byDay.find((r) => r._id === key)?.count ?? 0,
    });
  }

  const usersByDayRaw = await users
    .aggregate<{ _id: string; count: number }>([
      {
        $addFields: {
          _created: {
            $cond: [
              { $eq: [{ $type: "$createdAt" }, "string"] },
              { $toDate: "$createdAt" },
              { $ifNull: ["$created_at", "$createdAt"] },
            ],
          },
        },
      },
      { $match: { _created: { $gte: daysAgoUtc(13) } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$_created" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray()
    .catch(() => [] as { _id: string; count: number }[]);

  const users_by_day: { day: string; count: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKeyFromDate(daysAgoUtc(i));
    users_by_day.push({
      day: key,
      count: usersByDayRaw.find((r) => r._id === key)?.count ?? 0,
    });
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

  const feelingTotal = feelingRows.reduce((s, r) => s + r.count, 0) || 1;
  const feelings_7d = feelingRows.map((r) => {
    const meta = feelingOf(r._id);
    return {
      id: r._id,
      short: meta?.short ?? r._id,
      label: meta?.label ?? r._id,
      count: r.count,
      pct: ratio(r.count, feelingTotal),
    };
  });

  const mediaRows = await posts
    .aggregate<{ _id: string; count: number }>([
      { $match: { created_at: { $gte: d7 } } },
      { $group: { _id: { $ifNull: ["$media_type", "text"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();
  const mediaTotal = mediaRows.reduce((s, r) => s + r.count, 0) || 1;
  const media_7d = mediaRows.map((r) => ({
    type: r._id || "text",
    count: r.count,
    pct: ratio(r.count, mediaTotal),
  }));

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
      { $limit: 10 },
    ])
    .toArray();

  const engagedHandles = new Set<string>();
  const reactorHandles = await reactions
    .aggregate<{ _id: string }>([
      {
        $match: {
          $or: [{ created_at: { $gte: d7 } }, { createdAt: { $gte: d7 } }],
        },
      },
      { $group: { _id: "$handle" } },
      { $limit: 500 },
    ])
    .toArray()
    .catch(() => [] as { _id: string }[]);
  const replierHandles = await messages
    .aggregate<{ _id: string }>([
      {
        $match: {
          $or: [{ created_at: { $gte: d7 } }, { createdAt: { $gte: d7 } }],
        },
      },
      { $group: { _id: "$handle" } },
      { $limit: 500 },
    ])
    .toArray()
    .catch(() => [] as { _id: string }[]);
  for (const h of uniquePosters7) engagedHandles.add(String(h).toLowerCase());
  for (const r of reactorHandles) if (r._id) engagedHandles.add(String(r._id).toLowerCase());
  for (const r of replierHandles) if (r._id) engagedHandles.add(String(r._id).toLowerCase());

  const postsWow = pctChange(posts7, postsPrev7);
  const usersWow = pctChange(users7, usersPrev7);
  const postersWow = pctChange(uniquePosters7.length, uniquePostersPrev7.length);
  const engNow = reactions7 + replies7;
  const engPrev = reactionsPrev7 + repliesPrev7;
  const engagementWow = pctChange(engNow, engPrev);

  let direction: OwnerMetrics["trend"]["direction"] = "unknown";
  if (postsWow === null && usersWow === null && engagementWow === null) {
    direction = "unknown";
  } else {
    const score =
      (postsWow ?? 0) * 0.45 + (usersWow ?? 0) * 0.25 + (engagementWow ?? 0) * 0.3;
    if (score > 8) direction = "up";
    else if (score < -8) direction = "down";
    else direction = "flat";
  }

  const base: Omit<OwnerMetrics, "insights" | "health"> = {
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
      returning_posters: returningAgg.length,
      reactions: reactions7,
      replies: replies7,
      new_follows: follows7,
      prompt_answers: prompt7,
    },
    prior_7d: {
      new_users: usersPrev7,
      posts: postsPrev7,
      unique_posters: uniquePostersPrev7.length,
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
      reactions: reactionsYesterday,
      replies: repliesYesterday,
    },
    rates: {
      reactions_per_post_7d: posts7 ? Math.round((reactions7 / posts7) * 100) / 100 : 0,
      replies_per_post_7d: posts7 ? Math.round((replies7 / posts7) * 100) / 100 : 0,
      poster_share_of_users_7d: ratio(uniquePosters7.length, Math.max(usersTotal, 1)),
      prompt_share_of_posts_7d: ratio(prompt7, Math.max(posts7, 1)),
      push_opt_in_pct: ratio(pushTotal, Math.max(usersTotal, 1)),
      posts_dod_pct: pctChange(postsToday, postsYesterday),
    },
    funnel_7d: {
      users: usersTotal,
      posters: uniquePosters7.length,
      engaged: engagedHandles.size,
    },
    media_7d,
    trend: {
      posts_wow_pct: postsWow,
      users_wow_pct: usersWow,
      posters_wow_pct: postersWow,
      engagement_wow_pct: engagementWow,
      direction,
    },
    posts_by_day,
    users_by_day,
    feelings_7d,
    top_posters_7d: topRows.map((r) => ({
      handle: r._id,
      author: r.author || r._id,
      posts: r.posts,
    })),
  };

  const { insights, health } = buildInsights(base);
  return { ...base, insights, health };
}
