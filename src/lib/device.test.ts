import { test } from "node:test";
import assert from "node:assert/strict";
import { describeDevice } from "./device.ts";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const EDGE_WIN =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";
const FIREFOX_LINUX = "Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0";
const ELECTRON =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) AiTo/1.0.0 Chrome/126.0.0.0 Electron/31.0.0 Safari/537.36";

test("common browsers and platforms are named", () => {
  assert.equal(describeDevice(CHROME_MAC), "Chrome on macOS");
  assert.equal(describeDevice(SAFARI_IOS), "Safari on iOS");
  assert.equal(describeDevice(FIREFOX_LINUX), "Firefox on Linux");
});

test("browsers that also say Chrome/Safari are not mislabelled", () => {
  assert.equal(describeDevice(EDGE_WIN), "Edge on Windows");
  assert.equal(describeDevice(ELECTRON), "Desktop app on Windows");
});

test("missing or unrecognised user agents fall back safely", () => {
  assert.equal(describeDevice(undefined), "Unknown device");
  assert.equal(describeDevice(""), "Unknown device");
  assert.equal(describeDevice("curl/8.0"), "Unknown device");
});
