import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { translateToEnglish, isEnglishLang } from "@/lib/translate";
import { connectToDatabase, isMongoConfigured } from "@/lib/mongodb";

const LIMIT = 30;
const WINDOW_MS = 10 * 60_000;

export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const { ok, retryInSec } = await rateLimit(`translate:${ip}`, LIMIT, WINDOW_MS);
    if (!ok) {
      return NextResponse.json(
        { error: "Too many translations — try again shortly", retry_in_sec: retryInSec },
        { status: 429 }
      );
    }

    const body = await request.json();
    const { text, sourceLang } = body as { text?: string; sourceLang?: string };

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }
    if (text.length > 4500) {
      return NextResponse.json({ error: "Text is too long" }, { status: 400 });
    }

    if (isEnglishLang(sourceLang)) {
      return NextResponse.json({
        ok: true,
        translation: text.trim(),
        alreadyEnglish: true,
      });
    }

    const cacheKey = createHash("sha256")
      .update(`${(sourceLang ?? "auto").toLowerCase()}|en|${text.trim()}`)
      .digest("hex");

    if (isMongoConfigured()) {
      try {
        const { db } = await connectToDatabase();
        const cached = await db.collection("translations").findOne({ key: cacheKey });
        if (cached?.translation) {
          return NextResponse.json({
            ok: true,
            translation: cached.translation as string,
            cached: true,
          });
        }
      } catch {
        /* cache miss / unavailable — continue */
      }
    }

    const { translation } = await translateToEnglish(text, sourceLang);

    if (isMongoConfigured()) {
      try {
        const { db } = await connectToDatabase();
        await db.collection("translations").updateOne(
          { key: cacheKey },
          {
            $set: {
              key: cacheKey,
              translation,
              sourceLang: sourceLang ?? null,
              targetLang: "en",
              updatedAt: new Date().toISOString(),
            },
          },
          { upsert: true }
        );
      } catch {
        /* non-fatal */
      }
    }

    return NextResponse.json({ ok: true, translation });
  } catch (e) {
    console.error("translate error:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Translation failed" },
      { status: 500 }
    );
  }
}
