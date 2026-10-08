import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deletableUrls, parseUploadPathname, quotaWaitSec, uploadCaps, uploadKeyForUrl } from "./uploads.ts";

const U = "3f2b9c1e-8a7d-4e6f-9b0c-1d2e3f4a5b6c";

describe("upload names (H3)", () => {
  it("accepts only <take|avatar>-<uuid>.<ext>", () => {
    assert.deepEqual(parseUploadPathname(`take-${U}.webm`), { kind: "take", uuid: U });
    assert.deepEqual(parseUploadPathname(`avatar-${U}.jpg`), { kind: "avatar", uuid: U });
    for (const bad of [
      `take-1727712345678.webm`, // the old Date.now() names
      `take-${U}.html`,
      `take-${U}.webm/../x`,
      `backups/aithoughts.json.gz`,
      `other-${U}.webm`,
      `take-${U.toUpperCase()}.webm`,
    ]) {
      assert.equal(parseUploadPathname(bad), null, bad);
    }
  });

  it("keys a stored URL by its uuid, ignoring store, access and random suffix", () => {
    const priv = `https://abc.private.blob.vercel-storage.com/take-${U}-Xy12Zq.webm`;
    const pub = `https://abc.public.blob.vercel-storage.com/take-${U}-Qq99.webm?download=1`;
    assert.equal(uploadKeyForUrl(priv), `u:${U}`);
    assert.equal(uploadKeyForUrl(pub), `u:${U}`);
  });

  it("keys legacy files by pathname and refuses non-Blob hosts", () => {
    assert.equal(
      uploadKeyForUrl("https://abc.public.blob.vercel-storage.com/take-1727712345678-AbC.webm"),
      "p:take-1727712345678-AbC.webm"
    );
    assert.equal(uploadKeyForUrl(`https://evil.example/take-${U}-x.webm`), null);
    assert.equal(uploadKeyForUrl("not a url"), null);
  });
});

describe("which files go with deleted content (H3)", () => {
  const mine = "https://s.private.blob.vercel-storage.com/mine.webm";
  const theirs = "https://s.private.blob.vercel-storage.com/theirs.webm";
  const legacyAlone = "https://s.public.blob.vercel-storage.com/legacy-alone.jpg";
  const legacyShared = "https://s.public.blob.vercel-storage.com/legacy-shared.jpg";
  const owners = new Map([
    [mine, "me"],
    [theirs, "victim"],
  ]);

  it("deletes only the subject's recorded files and unshared legacy files", () => {
    assert.deepEqual(
      deletableUrls([mine, theirs, legacyAlone, legacyShared, mine], "me", owners, new Set([legacyShared])),
      [mine, legacyAlone]
    );
  });

  it("never deletes someone else's file, even when a moderator removes the post", () => {
    // A keeper removing an attacker's post that embedded the victim's file.
    assert.deepEqual(deletableUrls([theirs], "attacker", owners, new Set()), []);
  });
});

describe("upload size caps (M4)", () => {
  const MB = 1024 * 1024;
  it("caps photos at 10 MB, audio-only at 25 MB, audio/video at 500 MB", () => {
    assert.equal(uploadCaps(`take-${U}.jpg`)?.maxBytes, 10 * MB);
    assert.equal(uploadCaps(`avatar-${U}.png`)?.maxBytes, 10 * MB);
    assert.equal(uploadCaps(`take-${U}.m4a`)?.maxBytes, 25 * MB);
    assert.equal(uploadCaps(`take-${U}.webm`)?.maxBytes, 500 * MB);
    assert.equal(uploadCaps(`take-${U}.mov`)?.maxBytes, 500 * MB);
  });
  it("only lets a photo token upload photos, and avatars be photos", () => {
    assert.ok(uploadCaps(`avatar-${U}.jpg`)!.contentTypes.every((t) => t.startsWith("image/")));
    assert.equal(uploadCaps(`avatar-${U}.webm`), null);
    assert.equal(uploadCaps("take-123.webm"), null);
  });
});

describe("upload quotas (M4)", () => {
  const now = Date.parse("2026-09-30T12:00:00Z");
  const minsAgo = (m: number) => new Date(now - m * 60_000);
  it("allows 10 takes an hour, then says when the oldest frees up", () => {
    const nine = Array.from({ length: 9 }, (_, i) => minsAgo(i));
    assert.equal(quotaWaitSec("take", nine, now), 0);
    const ten = [...nine, minsAgo(50)];
    assert.equal(quotaWaitSec("take", ten, now), 10 * 60);
  });
  it("allows 30 takes a day even when spread out", () => {
    const thirty = Array.from({ length: 30 }, (_, i) => minsAgo(90 + i * 30));
    assert.ok(quotaWaitSec("take", thirty, now) > 0);
    assert.equal(quotaWaitSec("take", thirty.slice(1), now), 0);
  });
  it("allows 5 avatars a day", () => {
    const five = Array.from({ length: 5 }, (_, i) => minsAgo(60 * (i + 1)));
    assert.ok(quotaWaitSec("avatar", five, now) > 0);
    assert.equal(quotaWaitSec("avatar", five.slice(1), now), 0);
  });
});
