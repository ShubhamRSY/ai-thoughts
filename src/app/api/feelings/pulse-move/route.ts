import { NextResponse } from "next/server";
import { connectToDatabase, isMongoConfigured } from "@/lib/mongodb";
import { FEELINGS } from "@/lib/feelings";
import { promptDayKeyUTC, shiftDayKey } from "@/lib/daily-prompt";
import type { FeelingId } from "@/lib/types";

import { reportError } from "@/lib/report-error";
const FEELING_IDS = FEELINGS.map((f) => f.id);

interface DayBucket {
  day: string;
  feeling: FeelingId;
  count: number;
}

/**
 * GET /api/feelings/pulse-move
 * Quiet "how the pulse moved" summary — today vs yesterday (by prompt-day
 * buckets). No auth, no per-user data; feeds the day-after return hook.
 */
export async function GET() {
  const empty = {
    hasData: false,
    today: { count: 0 },
    yesterday: { count: 0 },
  };

  if (!isMongoConfigured()) {
    return NextResponse.json(empty, { status: 200 });
  }

  try {
    const { db } = await connectToDatabase();
    const today = promptDayKeyUTC();
    const yesterday = shiftDayKey(today, -1);

    const rows = (await db
      .collection("posts")
      .aggregate([
        {
          $match: {
            prompt_day: { $in: [today, yesterday] },
            feeling: { $in: FEELING_IDS },
          },
        },
        {
          $group: {
            _id: { day: "$prompt_day", feeling: "$feeling" },
            n: { $sum: 1 },
          },
        },
      ])
      .toArray()) as { _id: { day: string; feeling: FeelingId }; n: number }[];

    const buckets = new Map<string, DayBucket[]>();
    for (const r of rows) {
      const list = buckets.get(r._id.day) ?? [];
      list.push({ day: r._id.day, feeling: r._id.feeling, count: r.n });
      buckets.set(r._id.day, list);
    }

    const summarize = (day: string) => {
      const list = buckets.get(day) ?? [];
      const total = list.reduce((sum, b) => sum + b.count, 0);
      const top = [...list].sort((a, b) => b.count - a.count)[0];
      return top && total > 0 ? { count: total, feeling: top.feeling } : { count: total };
    };

    return NextResponse.json(
      {
        hasData: true,
        today: summarize(today),
        yesterday: summarize(yesterday),
      },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=600",
        },
      }
    );
  } catch (error) {
    console.error("pulse-move:", error);
    reportError(error, { route: "api/feelings/pulse-move" });
    return NextResponse.json(empty, { status: 200 });
  }
}