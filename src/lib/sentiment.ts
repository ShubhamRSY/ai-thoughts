import type { Collection, Db } from "mongodb";
import { feelingOf } from "@/lib/feelings";

/**
 * Aggregate-only mood analytics for the admin console. Every query here
 * groups by `feeling` and/or day — never by handle/user_id/email — so this
 * can never surface who felt what, only how many felt it. Keep it that way:
 * if you're tempted to join in handle/author here, that's a per-user
 * lookup and belongs behind the bounded-lookup path instead, not here.
 */

export interface FeelingBucket {
  id: string;
  short: string;
  label: string;
  count: number;
  pct: number;
}

export interface SentimentDay {
  day: string;
  total: number;
  dominant: { id: string; short: string; count: number } | null;
}

export interface SentimentSnapshot {
  generated_at: string;
  today: { total: number; buckets: FeelingBucket[] };
  last7d: { total: number; buckets: FeelingBucket[] };
  last30d: { total: number; buckets: FeelingBucket[] };
  daily: SentimentDay[];
}

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysAgoUtc(n: number): Date {
  const d = startOfUtcDay();
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toBuckets(rows: { _id: string; count: number }[]): { total: number; buckets: FeelingBucket[] } {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const buckets = rows.map((r) => {
    const meta = feelingOf(r._id);
    return {
      id: r._id,
      short: meta?.short ?? r._id,
      label: meta?.label ?? r._id,
      count: r.count,
      pct: total > 0 ? Math.round((r.count / total) * 1000) / 10 : 0,
    };
  });
  return { total, buckets };
}

async function feelingDistribution(
  posts: Collection,
  since: Date
): Promise<{ total: number; buckets: FeelingBucket[] }> {
  const rows = await posts
    .aggregate<{ _id: string; count: number }>([
      { $match: { created_at: { $gte: since }, feeling: { $exists: true, $nin: [null, ""] } } },
      { $group: { _id: "$feeling", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ])
    .toArray();
  return toBuckets(rows);
}

export async function collectSentimentSnapshot(db: Db): Promise<SentimentSnapshot> {
  const posts = db.collection("posts");

  const [today, last7d, last30d, dailyRows] = await Promise.all([
    feelingDistribution(posts, startOfUtcDay()),
    feelingDistribution(posts, daysAgoUtc(7)),
    feelingDistribution(posts, daysAgoUtc(30)),
    posts
      .aggregate<{ _id: { day: string; feeling: string }; count: number }>([
        {
          $match: {
            created_at: { $gte: daysAgoUtc(13) },
            feeling: { $exists: true, $nin: [null, ""] },
          },
        },
        {
          $group: {
            _id: {
              day: { $dateToString: { format: "%Y-%m-%d", date: "$created_at" } },
              feeling: "$feeling",
            },
            count: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]);

  const byDay = new Map<string, { id: string; count: number }[]>();
  for (const row of dailyRows) {
    const list = byDay.get(row._id.day) ?? [];
    list.push({ id: row._id.feeling, count: row.count });
    byDay.set(row._id.day, list);
  }

  const daily: SentimentDay[] = [];
  for (let i = 13; i >= 0; i--) {
    const key = dayKey(daysAgoUtc(i));
    const rows = (byDay.get(key) ?? []).sort((a, b) => b.count - a.count);
    const total = rows.reduce((s, r) => s + r.count, 0);
    const top = rows[0];
    daily.push({
      day: key,
      total,
      dominant: top ? { id: top.id, short: feelingOf(top.id)?.short ?? top.id, count: top.count } : null,
    });
  }

  return {
    generated_at: new Date().toISOString(),
    today,
    last7d,
    last30d,
    daily,
  };
}
