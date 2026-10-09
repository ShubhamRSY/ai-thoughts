import assert from "node:assert/strict";
import { test } from "node:test";
import { firstName } from "./display-name.ts";

test("firstName shows one tidy first name", () => {
  assert.equal(firstName("SHUBHAM RAJARAM YEDEKAR", "@shubz"), "Shubham");
  assert.equal(firstName("kaustubh adhav"), "Kaustubh");
  assert.equal(firstName("Kaustubh"), "Kaustubh");
  assert.equal(firstName("DeShawn Smith"), "DeShawn");
  assert.equal(firstName("  ", "@shubz"), "shubz");
  assert.equal(firstName(undefined, "@shubz"), "shubz");
});
