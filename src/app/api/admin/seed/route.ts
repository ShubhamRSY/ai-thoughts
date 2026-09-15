import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { GLOBAL_SEED_POSTS } from "@/lib/seed-posts";
import { authorizeBearer } from "@/lib/cron-auth";

function hash(s: string) {
  return createHash("sha256").update(s).digest("hex").slice(0, 16);
}

/**
 * POST /api/admin/seed — insert missing global demo takes (idempotent).
 * Requires Authorization: Bearer <ADMIN_SEED_SECRET or CRON_SECRET>.
 */
export async function POST(request: Request) {
  if (
    !authorizeBearer(request, {
      secrets: [process.env.ADMIN_SEED_SECRET, process.env.CRON_SECRET],
      allowInsecureDev: false,
    })
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { db } = await connectToDatabase();

    await db.collection("posts").createIndex({ seed_id: 1 }, { unique: true, sparse: true });

    const ids = GLOBAL_SEED_POSTS.map((p) => p.seed_id);
    const existing = await db
      .collection("posts")
      .find({ seed_id: { $in: ids } }, { projection: { seed_id: 1 } })
      .toArray();
    const have = new Set(existing.map((p) => p.seed_id as string));

    const docs = GLOBAL_SEED_POSTS.filter((p) => !have.has(p.seed_id)).map((p) => ({
      seed_id: p.seed_id,
      handle: p.handle,
      author: p.author,
      content: p.content,
      media_type: "text" as const,
      feeling: p.feeling,
      tags: p.tags,
      language: p.language,
      language_label: p.language_label,
      integrity_hash: hash(`${p.seed_id}:${p.handle}:${p.content}`),
      integrity_verified: false,
      integrity_label: "Sample voice",
      is_seed: true,
      created_at: new Date(Date.now() - p.hours * 3600e3),
      user_id: new ObjectId().toString(),
    }));

    if (docs.length > 0) {
      await db.collection("posts").insertMany(docs);
    }

    await db.collection("posts").updateMany(
      {
        $or: [{ seed_id: { $exists: true, $ne: null } }, { is_seed: true }],
      },
      { $set: { integrity_verified: false, integrity_label: "Sample voice", is_seed: true } }
    );

    const removed = await db.collection("posts").deleteMany({
      seed_id: { $exists: false },
      handle: { $in: ["@maravoss", "@dexbuilds", "@priyathinks"] },
    });

    const total = await db.collection("posts").countDocuments();
    return NextResponse.json({
      ok: true,
      inserted: docs.length,
      already: have.size,
      removedLegacy: removed.deletedCount,
      total,
      catalog: GLOBAL_SEED_POSTS.length,
    });
  } catch (e) {
    console.error("seed error:", e);
    return NextResponse.json({ error: "Seed failed" }, { status: 500 });
  }
}
