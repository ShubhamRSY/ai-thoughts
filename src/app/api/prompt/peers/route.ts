import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { getSession } from "@/lib/auth";
import { listFollowing } from "@/lib/follows";
import { hiddenAuthorFilter } from "@/lib/visibility";
import { dailyPromptForDay, todayKey, yesterdayKey } from "@/lib/daily-prompt";

function norm(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function handleVariants(handles: string[]): string[] {
  const out = new Set<string>();
  for (const h of handles) {
    const n = norm(h);
    if (!n) continue;
    out.add(h);
    out.add(`@${n}`);
    out.add(n);
  }
  return Array.from(out);
}

/**
 * GET /api/prompt/peers?day=YYYY-MM-DD
 * Up to 3 people who answered the same daily prompt (not you, not already followed).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    const day =
      request.nextUrl.searchParams.get("day")?.trim() || todayKey();
    const mode = request.nextUrl.searchParams.get("mode") || "peers";

    const { db } = await connectToDatabase();
    const prompt = dailyPromptForDay(day);

    if (mode === "catchup") {
      const catchDay = request.nextUrl.searchParams.get("day")?.trim() || yesterdayKey();
      if (!session) {
        return NextResponse.json({
          day: catchDay,
          prompt: dailyPromptForDay(catchDay),
          posts: [],
        });
      }
      const following = await listFollowing(db, session.handle);
      if (following.length === 0) {
        return NextResponse.json({
          day: catchDay,
          prompt: dailyPromptForDay(catchDay),
          posts: [],
        });
      }
      const variants = handleVariants(following);
      const rows = await db
        .collection("posts")
        .find({
          prompt_day: catchDay,
          archived: { $ne: true },
          handle: { $in: variants },
        })
        .sort({ created_at: -1 })
        .limit(8)
        .toArray();

      return NextResponse.json({
        day: catchDay,
        prompt: dailyPromptForDay(catchDay),
        posts: rows.map((p) => ({
          id: p._id?.toString(),
          handle: p.handle,
          author: p.author || String(p.handle).replace(/^@/, ""),
          content: String(p.content || "").slice(0, 220),
          feeling: p.feeling ?? null,
          media_type: p.media_type,
          created_at:
            p.created_at instanceof Date
              ? p.created_at.toISOString()
              : String(p.created_at),
        })),
      });
    }

    // peers for feel-with suggestions
    const following = session ? await listFollowing(db, session.handle) : [];
    const skip = new Set([
      ...(session ? [norm(session.handle)] : []),
      ...following.map(norm),
    ]);

    const rows = await db
      .collection("posts")
      .find({
        prompt_day: day,
        archived: { $ne: true },
        ...(await hiddenAuthorFilter(db, session?.handle ?? null)),
      })
      .sort({ created_at: -1 })
      .limit(40)
      .toArray();

    const seen = new Set<string>();
    const peers: {
      handle: string;
      author: string;
      preview: string;
      post_id: string;
      feeling: string | null;
    }[] = [];

    for (const p of rows) {
      const h = norm(String(p.handle || ""));
      if (!h || skip.has(h) || seen.has(h)) continue;
      seen.add(h);
      peers.push({
        handle: String(p.handle).startsWith("@")
          ? String(p.handle)
          : `@${h}`,
        author: String(p.author || h),
        preview: String(p.content || "").slice(0, 120),
        post_id: p._id?.toString() ?? "",
        feeling: (p.feeling as string) || null,
      });
      if (peers.length >= 3) break;
    }

    return NextResponse.json({
      day,
      prompt,
      peers,
      count: await db.collection("posts").countDocuments({ prompt_day: day }),
    });
  } catch (e) {
    console.error("prompt peers:", e);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}
