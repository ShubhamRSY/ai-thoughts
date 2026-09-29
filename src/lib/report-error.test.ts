import assert from "node:assert/strict";
import { it } from "node:test";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubEvent } from "./report-error.ts";

it("scrubEvent redacts emails anywhere in the event", () => {
  const event = {
    exception: { values: [{ value: 'E11000 dup key: { email: "Jo.Doe+x@Example.co.uk" }' }] },
    breadcrumbs: [{ message: "sign-in error: ann@test.io" }],
    tags: { route: "api/auth/sign-in" },
  } as ErrorEvent;
  const out = JSON.stringify(scrubEvent(event));
  assert.doesNotMatch(out, /@(example|test)/i);
  assert.match(out, /\[email\]/);
  assert.match(out, /api\/auth\/sign-in/);
});
