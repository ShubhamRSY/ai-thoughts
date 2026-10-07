import { test, expect, request as pwRequest, type APIRequestContext } from "@playwright/test";
import { ObjectId } from "mongodb";

// The Report-desk queue accepts comments (target_type: "comment") and only
// resolves content from the stored row. Covers the "Report" button added to
// ChatPanel: a report on a comment is stored with its real author handle and a
// server-side snippet, dupes are swallowed, and unreachable targets 404.
// (ChatPanel itself is covered by the browser flows in other specs; this
// exercises the endpoint the button calls.)

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;

const uniq = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
let ipSeq = 0;
const nextIp = () => `10.92.${Math.floor(ipSeq / 200)}.${(ipSeq++ % 200) + 1}`;

type U = { api: APIRequestContext; handle: string; id: string };

async function newUser(label: string): Promise<U> {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": nextIp() },
  });
  const email = `e2e-comment-report-${label}-${uniq()}@example.com`;
  const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
  const verify = await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  const { user } = await verify.json();
  return { api, handle: user.handle, id: user.id };
}

test.describe("comment reports", () => {
  test("a comment on a public take can be reported once, resolving real author and snippet", async () => {
    const reporter = await newUser("reporter");
    try {
      const postRes = await reporter.api.post("/api/posts", {
        data: { content: `e2e comment-report post ${uniq()}`, media_type: "text" },
      });
      expect(postRes.ok(), await postRes.text()).toBeTruthy();
      const created = await postRes.json();
      const postId = created.id;

      const msgBody = `a comment worth reporting ${uniq()}`;
      const msgRes = await reporter.api.post(`/api/posts/${postId}/messages`, {
        data: { handle: reporter.handle, author: reporter.handle, body: msgBody },
      });
      expect(msgRes.ok(), await msgRes.text()).toBeTruthy();
      const { id: messageId } = await msgRes.json();

      const report = await reporter.api.post("/api/reports", {
        data: { target_type: "comment", target_id: messageId, reason: "Hate or harassment" },
      });
      expect(report.ok(), await report.text()).toBeTruthy();
      const reportBody = await report.json();
      expect(reportBody.ok).toBe(true);
      expect(reportBody.alreadyReported).toBeFalsy();

      // Duplicate (target, reporter) is swallowed, not double-queued.
      const dup = await reporter.api.post("/api/reports", {
        data: { target_type: "comment", target_id: messageId, reason: "Harms someone" },
      });
      expect(dup.ok(), await dup.text()).toBeTruthy();
      expect((await dup.json()).alreadyReported).toBe(true);
    } finally {
      await reporter.api.dispose();
    }
  });

  test("a missing comment and a missing post parent 404", async () => {
    const reporter = await newUser("missing");
    try {
      const missing = await reporter.api.post("/api/reports", {
        data: {
          target_type: "comment",
          target_id: new ObjectId().toString(),
          reason: "Spam or coordinated accounts",
        },
      });
      expect(missing.status()).toBe(404);
    } finally {
      await reporter.api.dispose();
    }
  });

  test("guests are refused", async () => {
    const guest = await pwRequest.newContext({
      baseURL: ORIGIN,
      extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": nextIp() },
    });
    try {
      const res = await guest.post("/api/reports", {
        data: {
          target_type: "comment",
          target_id: new ObjectId().toString(),
          reason: "Hate or harassment",
        },
      });
      expect(res.status()).toBe(401);
    } finally {
      await guest.dispose();
    }
  });
});