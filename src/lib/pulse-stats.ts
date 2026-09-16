import { connectToDatabase, isMongoConfigured } from "@/lib/mongodb";
import { INITIAL_THOUGHTS } from "@/lib/mock-data";
import type { FeelingId } from "@/lib/types";

// Server-only: powers the pre-login pages (/ and /sign-in) with a real
// snapshot of the pulse instead of static marketing copy — falls back to
// the demo fixtures whenever Mongo isn't configured or a query fails, so
// these pages never 500 just because the DB hiccups.

export interface PulseSample {
  id: string;
  author: string;
  handle: string;
  content: string;
  feeling: FeelingId | null;
  timeLabel: string;
}

export interface PulseStats {
  total: number;
  samples: PulseSample[];
}

function timeAgo(date: Date): string {
  const m = Math.floor((Date.now() - date.getTime()) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

const FALLBACK_SAMPLES: PulseSample[] = INITIAL_THOUGHTS.slice(0, 3).map((t) => ({
  id: t.id,
  author: t.author,
  handle: t.handle,
  content: t.content,
  feeling: t.feeling ?? null,
  timeLabel: t.timeLabel,
}));

const FALLBACK_STATS: PulseStats = { total: INITIAL_THOUGHTS.length, samples: FALLBACK_SAMPLES };

/** Soft social proof — 38 → "30+", 41 → "40+", never an exact headcount. */
export function crowdCountLabel(total: number): string {
  if (total < 25) return "Be one of the first to say how AI feels.";
  const bucket = Math.floor(total / 10) * 10;
  return `${bucket.toLocaleString()}+ people already expressing themselves.`;
}

export async function getPulseStats(): Promise<PulseStats> {
  if (!isMongoConfigured()) return FALLBACK_STATS;

  try {
    const { db } = await connectToDatabase();
    const [total, recent] = await Promise.all([
      db.collection("posts").countDocuments(),
      db
        .collection("posts")
        .find({}, { projection: { handle: 1, author: 1, content: 1, feeling: 1, created_at: 1 } })
        .sort({ created_at: -1 })
        .limit(3)
        .toArray(),
    ]);

    if (recent.length === 0) return { total: total || FALLBACK_STATS.total, samples: FALLBACK_SAMPLES };

    return {
      total,
      samples: recent.map((p) => ({
        id: p._id.toString(),
        author: (p.author as string) || (p.handle as string)?.replace(/^@/, "") || "Anonymous",
        handle: (p.handle as string) ?? "@anon",
        content: String(p.content ?? ""),
        feeling: (p.feeling as FeelingId) ?? null,
        timeLabel: timeAgo(p.created_at instanceof Date ? p.created_at : new Date(p.created_at as string)),
      })),
    };
  } catch {
    return FALLBACK_STATS;
  }
}
