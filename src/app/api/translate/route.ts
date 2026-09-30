import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { translateToEnglish, isEnglishLang } from "@/lib/translate";
import { connectToDatabase, isMongoConfigured } from "@/lib/mongodb";
import { reportError } from "@/lib/report-error";
import { getSession } from "@/lib/auth";

const LIMIT = 30;
const WINDOW_MS = 10 * 60_000;

export async function POST(request: Request) {
  try {
    // Members only (L1): the button is only in the members' feed, and an open
    // endpoint let anyone use this server to call the translation service and
    // fill the cache.
    if (!(await getSession())) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
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
      } catch (e) {
        // Cache unavailable — translate anyway.
        reportError(e, { route: "api/translate", service: "mongodb" });
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
              cached_at: new Date(), // TTL (lib/indexes.ts)
            },
          },
          { upsert: true }
        );
      } catch (e) {
        // Non-fatal: the translation is still returned.
        reportError(e, { route: "api/translate", service: "mongodb" });
      }
    }

    return NextResponse.json({ ok: true, translation });
  } catch (e) {
    console.error("translate error:", e);
    reportError(e, { route: "api/translate" });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Translation failed" },
      { status: 500 }
    );
  }
}
