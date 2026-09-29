import assert from "node:assert/strict";
import { test } from "node:test";
import { isPlayableMediaHeader } from "./media-sniff.ts";

const bytes = (...parts: (string | number[])[]) =>
  new Uint8Array(parts.flatMap((p) => (typeof p === "string" ? [...p].map((c) => c.charCodeAt(0)) : p)));

test("accepts the containers the recorder and pickers produce", () => {
  assert.ok(isPlayableMediaHeader(bytes([0x1a, 0x45, 0xdf, 0xa3, 0, 0]))); // webm
  assert.ok(isPlayableMediaHeader(bytes([0, 0, 0, 0x20], "ftypisom"))); // mp4
  assert.ok(isPlayableMediaHeader(bytes([0, 0, 0, 0x14], "ftypqt  "))); // mov
  assert.ok(isPlayableMediaHeader(bytes([0, 0, 0, 0x1c], "ftypM4A "))); // m4a
  assert.ok(isPlayableMediaHeader(bytes("OggS", [0, 2])));
  assert.ok(isPlayableMediaHeader(bytes("ID3", [4, 0])));
  assert.ok(isPlayableMediaHeader(bytes([0xff, 0xfb, 0x90, 0x44]))); // bare mp3 frame
  assert.ok(isPlayableMediaHeader(bytes("RIFF", [0, 0, 0, 0], "WAVE")));
  assert.ok(isPlayableMediaHeader(bytes("RIFF", [0, 0, 0, 0], "WEBP")));
  assert.ok(isPlayableMediaHeader(bytes([0xff, 0xd8, 0xff, 0xe0])));
  assert.ok(isPlayableMediaHeader(bytes([0x89], "PNG", [0x0d, 0x0a])));
});

test("rejects disguised and broken files", () => {
  assert.equal(isPlayableMediaHeader(bytes("MZ", [0x90, 0, 3, 0, 0, 0])), false); // .exe renamed .mp4
  assert.equal(isPlayableMediaHeader(bytes("<!DOCTYPE html>")), false);
  assert.equal(isPlayableMediaHeader(bytes("<svg xmlns=")), false);
  assert.equal(isPlayableMediaHeader(bytes("%PDF-1.7")), false);
  assert.equal(isPlayableMediaHeader(bytes("RIFF", [0, 0, 0, 0], "AVI ")), false);
  assert.equal(isPlayableMediaHeader(bytes([0, 0, 0])), false); // truncated
  assert.equal(isPlayableMediaHeader(new Uint8Array(32)), false); // zero-filled / corrupted
});
