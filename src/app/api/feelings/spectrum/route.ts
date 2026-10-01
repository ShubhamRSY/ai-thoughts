import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { FEELINGS } from "@/lib/feelings";
import { getSession } from "@/lib/auth";
import { hiddenHandles } from "@/lib/visibility";
import { reportError } from "@/lib/report-error";

const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const FEELING_IDS = FEELINGS.map((f) => f.id);

/**
 * GET /api/feelings/spectrum — the community feeling tally for the last 7 days.
 *
 * Members only, and counted over what *this* viewer is allowed to see: takes
 * and check-ins belonging to private or locked accounts (and to anyone in a
 * block with the viewer) are left out. An aggregate is still derived from real
 * posts, so a signed-in member polling it could otherwise infer that a
 * specific private account posted or felt something on a given day — the one
 * thing those accounts chose to keep to themselves.
 *
 * The tally is per-viewer, so it must never be cached by a shared cache.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    const viewer = session.handle;

    const { db } = await connectToDatabase();
    const since = new Date(Date.now() - WINDOW_MS);
    // Same restricted-author set every other read path uses: blocked accounts
    // plus private/locked ones this viewer isn't an approved follower of.
    const hidden = await hiddenHandles(db, viewer);
    const authorFilter = hidden.length ? { handle: { $nin: hidden } } : {};

    const rows = await db
      .collection("posts")
      .aggregate([
        {
          $match: {
            feeling: { $in: FEELING_IDS },
            created_at: { $gte: since },
            archived: { $ne: true },
            ...authorFilter,
          },
        },
        { $group: { _id: "$feeling", count: { $sum: 1 } } },
      ])
      .toArray();

    const taps = await db
      .collection("moods")
      .aggregate([
        // moods are keyed by handle_norm (no "@"), so match against the
        // normalized form of the hidden set.
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
      // Per-viewer: a shared cache would hand one member's tally to another.
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/feelings/spectrum" });
    return NextResponse.json({ tally: [], total: 0 }, { status: 500 });
  }
}
