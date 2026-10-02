import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { listDigestRecipients } from "@/lib/prefs";
import { sendEmailBatch, weeklyVoicesEmail } from "@/lib/email";
import { feelingOf } from "@/lib/feelings";
import type { FeelingId } from "@/lib/types";
import { authorizeCron } from "@/lib/cron-auth";
import { hiddenAuthorFilter } from "@/lib/visibility";
import { reportError } from "@/lib/report-error";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  try {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const weekAgo = new Date(Date.now() - 7 * 864e5);
    const posts = await db
      .collection("posts")
      .find({
        created_at: { $gte: weekAgo },
        archived: { $ne: true },
        ...(await hiddenAuthorFilter(db, null)),
      })
      .sort({ created_at: -1 })
      .limit(200)
      .toArray();

    const counts: Record<string, number> = {};
    for (const p of posts) {
      if (p.feeling) counts[p.feeling] = (counts[p.feeling] ?? 0) + 1;
    }
    const topFeelingId = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
      "using-it") as FeelingId;
    const topFeeling = feelingOf(topFeelingId)?.short || "alive";

    const highlights = posts.slice(0, 4).map((p) => ({
      author: String(p.author || p.handle || "Someone"),
      content: String(p.content || "").slice(0, 160),
    }));

    const week = Math.ceil(
      (Date.now() - Date.UTC(new Date().getFullYear(), 0, 1)) / (7 * 864e5)
    );
    const episodeTitle = `Week ${week} felt ${topFeeling.toLowerCase()}`;

    const recipients = await listDigestRecipients(db, "weekly_digest");
    const accepted = await sendEmailBatch(
      recipients.map((r) =>
        weeklyVoicesEmail(r.email, {
          handle: r.handle,
          episodeTitle,
          topFeeling: topFeeling.toLowerCase(),
          takeCount: posts.length,
          highlights,
        })
      ),
      "api/cron/weekly-voices"
    );
    const sent = accepted.filter(Boolean).length;

    return NextResponse.json({
      ok: true,
      sent,
      takeCount: posts.length,
      episodeTitle,
      recipients: recipients.length,
    });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/cron/weekly-voices" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
