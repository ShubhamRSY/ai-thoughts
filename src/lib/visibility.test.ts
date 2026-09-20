import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decideVisibility,
  followStatusFor,
  pendingActionFor,
  canBeReposted,
  parsePrivacy,
} from "./visibility.ts";

const stranger = { isSelf: false, isApprovedFollower: false };
const follower = { isSelf: false, isApprovedFollower: true };
const self = { isSelf: true, isApprovedFollower: false };

test("public: everything visible to everyone", () => {
  assert.deepEqual(decideVisibility("public", stranger), {
    posts: true, profile: true, lists: true, searchable: true,
  });
});

test("private: stranger sees the shell and search, not posts or lists", () => {
  assert.deepEqual(decideVisibility("private", stranger), {
    posts: false, profile: true, lists: false, searchable: true,
  });
});

test("locked: stranger sees nothing and cannot search", () => {
  assert.deepEqual(decideVisibility("locked", stranger), {
    posts: false, profile: false, lists: false, searchable: false,
  });
});

test("approved followers and self see everything on every level", () => {
  for (const p of ["public", "private", "locked"] as const) {
    for (const rel of [follower, self]) {
      assert.deepEqual(decideVisibility(p, rel), {
        posts: true, profile: true, lists: true, searchable: true,
      });
    }
  }
});

test("follow status per privacy level", () => {
  assert.equal(followStatusFor("public"), "approved");
  assert.equal(followStatusFor("private"), "pending");
  assert.equal(followStatusFor("locked"), null);
});

test("privacy transitions resolve pending requests", () => {
  assert.equal(pendingActionFor("public"), "approve");
  assert.equal(pendingActionFor("locked"), "decline");
  assert.equal(pendingActionFor("private"), "none");
});

test("only public takes can be reposted or quoted", () => {
  assert.equal(canBeReposted("public"), true);
  assert.equal(canBeReposted("private"), false);
  assert.equal(canBeReposted("locked"), false);
});

test("parsePrivacy defaults anything unknown to public", () => {
  assert.equal(parsePrivacy(undefined), "public");
  assert.equal(parsePrivacy("bogus"), "public");
  assert.equal(parsePrivacy("private"), "private");
  assert.equal(parsePrivacy("locked"), "locked");
});
