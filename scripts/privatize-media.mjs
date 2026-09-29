// One-time move of existing takes' files from the public Blob store to the
// private one (src/lib/media-access.ts). New uploads already go private once
// BLOB_PRIVATE_READ_WRITE_TOKEN is set; this handles what was uploaded before.
//
//   MONGODB_URL=... MONGODB_DB=aithoughts BLOB_READ_WRITE_TOKEN=... \
//   BLOB_PRIVATE_READ_WRITE_TOKEN=... node scripts/privatize-media.mjs [--apply]
//
// Without --apply it only lists what it would move. Per file: copy to the
// private store, point the post at the copy, then delete the public file, so
// an interrupted run never leaves a post pointing at nothing. Safe to re-run.
import { MongoClient } from "mongodb";
import { put, del } from "@vercel/blob";

const apply = process.argv.includes("--apply");
const { MONGODB_URL, MONGODB_DB = "aithoughts", BLOB_READ_WRITE_TOKEN, BLOB_PRIVATE_READ_WRITE_TOKEN } = process.env;
if (!MONGODB_URL || !BLOB_READ_WRITE_TOKEN || !BLOB_PRIVATE_READ_WRITE_TOKEN) {
  console.error("Set MONGODB_URL, MONGODB_DB, BLOB_READ_WRITE_TOKEN and BLOB_PRIVATE_READ_WRITE_TOKEN.");
  process.exit(2);
}

const client = await MongoClient.connect(MONGODB_URL, { serverSelectionTimeoutMS: 10000, family: 4 });
const posts = client.db(MONGODB_DB).collection("posts");
let moved = 0;
let failed = 0;
try {
  const cursor = posts.find(
    { media_url: /\.public\.blob\.vercel-storage\.com\// },
    { projection: { media_url: 1 } }
  );
  for await (const post of cursor) {
    const from = post.media_url;
    const pathname = decodeURIComponent(new URL(from).pathname.slice(1));
    if (!apply) {
      console.log("would move", String(post._id), pathname);
      moved++;
      continue;
    }
    try {
      const res = await fetch(from);
      if (!res.ok) throw new Error(`download ${res.status}`);
      const copy = await put(pathname, Buffer.from(await res.arrayBuffer()), {
        access: "private",
        addRandomSuffix: false,
        allowOverwrite: true,
        contentType: res.headers.get("content-type") ?? undefined,
        token: BLOB_PRIVATE_READ_WRITE_TOKEN,
      });
      await posts.updateOne({ _id: post._id, media_url: from }, { $set: { media_url: copy.url } });
      await del(from, { token: BLOB_READ_WRITE_TOKEN });
      console.log("moved", String(post._id), pathname);
      moved++;
    } catch (e) {
      console.error("FAILED", String(post._id), pathname, e.message);
      failed++;
    }
  }
} finally {
  await client.close();
}
console.log(`${apply ? "Moved" : "Would move"} ${moved} file(s)${failed ? `, ${failed} failed (re-run to retry)` : ""}.`);
if (!apply) console.log("Run again with --apply to do it.");
process.exit(failed ? 1 : 0);
