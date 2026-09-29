import { test } from "node:test";
import assert from "node:assert/strict";
import { isPrivateBlobUrl, signMediaUrl, blobTokenFor } from "./media-access.ts";
import { isAllowedMediaUrl } from "./media-sniff.ts";

const PUBLIC = "https://pubstore.public.blob.vercel-storage.com/take-1.webm";
const PRIVATE = "https://privstore.private.blob.vercel-storage.com/take-1.webm";

test("public and legacy links pass through; private ones never leak unsigned", async () => {
  delete process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
  assert.equal(isPrivateBlobUrl(PRIVATE), true);
  assert.equal(isPrivateBlobUrl(PUBLIC), false);
  assert.equal(await signMediaUrl(PUBLIC), PUBLIC);
  assert.equal(await signMediaUrl("/media/sample-1.mp3"), "/media/sample-1.mp3");
  assert.equal(await signMediaUrl(null), null);
  // No private token: the raw private URL must not be handed out.
  assert.equal(await signMediaUrl(PRIVATE), null);
});

test("each URL is deleted with its own store's token", () => {
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_pubstore_x";
  process.env.BLOB_PRIVATE_READ_WRITE_TOKEN = "vercel_blob_rw_privstore_y";
  assert.equal(blobTokenFor(PUBLIC), "vercel_blob_rw_pubstore_x");
  assert.equal(blobTokenFor(PRIVATE), "vercel_blob_rw_privstore_y");
});

test("takes may use our private store; avatars and other stores may not", () => {
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_pubstore_x";
  process.env.BLOB_PRIVATE_READ_WRITE_TOKEN = "vercel_blob_rw_privstore_y";
  assert.equal(isAllowedMediaUrl(PRIVATE, true), true);
  assert.equal(isAllowedMediaUrl(PRIVATE), false);
  assert.equal(isAllowedMediaUrl(PUBLIC), true);
  assert.equal(isAllowedMediaUrl("https://other.private.blob.vercel-storage.com/x.webm", true), false);
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
});

test("a second store's BLOB_STORE_ID doesn't lock out the public store", () => {
  process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_pubstore_x";
  process.env.BLOB_STORE_ID = "store_privstore";
  assert.equal(isAllowedMediaUrl(PUBLIC), true);
  delete process.env.BLOB_READ_WRITE_TOKEN;
  delete process.env.BLOB_STORE_ID;
});
