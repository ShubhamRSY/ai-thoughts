import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { FEELINGS } from "@/lib/feelings";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FEELING_IDS = FEELINGS.map((f) => f.id);

/** Aggregate feeling counts across recent posts and one-tap check-ins — no auth needed, no per-user data. */
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const since = new Date(Date.now() - WINDOW_MS);
    const rows = await db
      .collection("posts")
      .aggregate([
        { $match: { feeling: { $in: FEELING_IDS }, created_at: { $gte: since } } },
        { $group: { _id: "$feeling", count: { $sum: 1 } } },
      ])
      .toArray();

    const taps = await db
      .collection("moods")
      .aggregate([
        { $match: { source: "tap", created_at: { $gte: since } } },
        { $group: { _id: "$feeling", count: { $sum: 1 } } },
      ])
      .toArray();

    const counts = new Map<string, number>();
    for (const r of [...rows, ...taps]) {
      counts.set(String(r._id), (counts.get(String(r._id)) ?? 0) + Number(r.count));
    }
    const tally = [...counts]
      .map(([id, count]) => ({ id, count }))
      .sort((a, b) => b.count - a.count);
    const total = tally.reduce((sum, r) => sum + r.count, 0);

    return NextResponse.json(
      { tally, total },
      { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" } }
    );
  } catch (error) {
    console.error(error);
    return NextResponse.json({ tally: [], total: 0 }, { status: 500 });
  }
}
