import { unstable_cache } from "next/cache";
import { connectToDatabase, isMongoConfigured } from "@/lib/mongodb";
import { FEELINGS } from "@/lib/feelings";
import { hiddenHandles } from "@/lib/visibility";
import type { FeelingId } from "@/lib/types";

// Server-only: powers the public /pulse pages (and /pulse/[feeling]) with a
// real snapshot of community feeling — no session required. Restricted
// accounts (private, locked, blocked) never appear; for these pages the
// viewer is always null, so the tally covers public accounts only.

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FEELING_IDS = FEELINGS.map((f) => f.id);

export interface PublicTake {
  id: string;
  handle: string;
  author: string;
  content: string;
  feeling: string | null;
  mediaType: string;
  createdAt: string;
}

export interface FeelingCount {
  id: string;
  count: number;
}

export interface PublicPulse {
  tally: FeelingCount[];
  total: number;
  dominant: FeelingCount | null;
  samples: PublicTake[];
  authorCount: number;
}

const EMPTY: PublicPulse = { tally: [], total: 0, dominant: null, samples: [], authorCount: 0 };

function mapTake(p: {
  _id?: unknown;
  handle?: string;
  author?: string;
  content?: string;
  feeling?: string | null;
  media_type?: string;
  created_at?: Date | string;
}): PublicTake {
  return {
    id: String(p._id ?? ""),
    handle: String(p.handle ?? ""),
    author: String(p.author ?? p.handle ?? "").replace(/^@/, ""),
    content: String(p.content ?? "").slice(0, 400),
    feeling: p.feeling ?? null,
    mediaType: String(p.media_type ?? "text"),
    createdAt: p.created_at instanceof Date ? p.created_at.toISOString() : String(p.created_at ?? ""),
  };
}

const loadPublicPulse = unstable_cache(
  async (): Promise<PublicPulse> => {
    const { db } = await connectToDatabase();
    const since = new Date(Date.now() - WINDOW_MS);
    // Viewer is null — only public accounts' takes and taps count.
    const hidden = await hiddenHandles(db, null);
    const authorFilter = hidden.length ? { handle: { $nin: hidden } } : {};

    const [rows, taps, authors, recent] = await Promise.all([
      db
        .collection("posts")
        .aggregate<{ _id: string; n: number }>([
          {
            $match: {
              feeling: { $in: FEELING_IDS },
              created_at: { $gte: since },
              archived: { $ne: true },
              ...authorFilter,
            },
          },
          { $group: { _id: "$feeling", n: { $sum: 1 } } },
        ])
        .toArray(),
      db
        .collection("moods")
        .aggregate<{ _id: string; n: number }>([
          {
            $match: {
              source: "tap",
              created_at: { $gte: since },
              ...(hidden.length
                ? { handle_norm: { $nin: hidden.map((h) => h.trim().toLowerCase().replace(/^@/, "")) } }
                : {}),
            },
          },
          { $unwind: "$feeling" },
          { $group: { _id: "$feeling", n: { $sum: 1 } } },
        ])
        .toArray(),
      db
        .collection("posts")
        .distinct("user_id", { seed_id: { $exists: false }, ...authorFilter }),
      db
        .collection("posts")
        .find({ archived: { $ne: true }, ...authorFilter }, {
          projection: { handle: 1, author: 1, content: 1, feeling: 1, media_type: 1, created_at: 1 },
        })
        .sort({ created_at: -1 })
        .limit(6)
        .toArray(),
    ]);

    const counts = new Map<string, number>();
    for (const r of [...rows, ...taps]) counts.set(String(r._id), (counts.get(String(r._id)) ?? 0) + Number(r.n));
    const tally = [...counts].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);
    const total = tally.reduce((sum, r) => sum + r.count, 0);

    return {
      tally,
      total,
      dominant: tally[0] ?? null,
      samples: recent.map(mapTake),
      authorCount: authors.length,
    };
  },
  ["public-pulse"],
  { revalidate: 300 }
);

export async function getPublicPulse(): Promise<PublicPulse> {
  if (!isMongoConfigured()) return EMPTY;
  try {
    return await loadPublicPulse();
  } catch {
    return EMPTY;
  }
}

const loadFeelingTakes = unstable_cache(
  async (feelingId: string): Promise<PublicTake[]> => {
    const { db } = await connectToDatabase();
    const hidden = await hiddenHandles(db, null);
    const rows = await db
      .collection("posts")
      .find(
        {
          feeling: feelingId,
          archived: { $ne: true },
          ...(hidden.length ? { handle: { $nin: hidden } } : {}),
        },
        { projection: { handle: 1, author: 1, content: 1, feeling: 1, media_type: 1, created_at: 1 } }
      )
      .sort({ created_at: -1 })
      .limit(24)
      .toArray();
    return rows.map(mapTake);
  },
  ["feeling-takes"],
  { revalidate: 300 }
);

export async function getFeelingTakes(feelingId: string): Promise<PublicTake[]> {
  if (!isMongoConfigured()) return [];
  try {
    return await loadFeelingTakes(feelingId);
  } catch {
    return [];
  }
}

export function isFeelingId(id: string): id is FeelingId {
  return (FEELING_IDS as string[]).includes(id);
}
