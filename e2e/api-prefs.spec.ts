import { test, expect, request as pwRequest } from "@playwright/test";

// POST /api/prefs is a patch: only the fields you send change. It used to reset
// email_digest to false and weekly_digest to true whenever they were omitted,
// so the onboarding call ({ onboarded: true }) silently opted people into the
// weekly email.

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;

test("prefs are patched, not replaced, and nothing is opted in by default", async () => {
  const api = await pwRequest.newContext({
    baseURL: ORIGIN,
    extraHTTPHeaders: { Origin: ORIGIN, "X-Forwarded-For": "10.80.0.1" },
  });
  try {
    const email = `e2e-prefs-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    const { devCode } = await (await api.post("/api/auth/sign-in", { data: { email } })).json();
    expect((await api.post("/api/auth/verify", { data: { email, code: devCode, age_confirmed: true } })).ok()).toBeTruthy();

    const get = async () => (await api.get("/api/prefs")).json();
    const post = async (data: object) => {
      const res = await api.post("/api/prefs", { data });
      expect(res.ok(), await res.text()).toBeTruthy();
      return res.json();
    };

    // Fresh account: no email is opted in.
    expect(await get()).toMatchObject({ email_digest: false, weekly_digest: false });

    // One toggle leaves the other alone.
    expect(await post({ email_digest: true })).toMatchObject({ email_digest: true, weekly_digest: false });
    expect(await post({ weekly_digest: true })).toMatchObject({ email_digest: true, weekly_digest: true });

    // The onboarding call sends only { onboarded: true } and must not touch digests.
    expect(await post({ onboarded: true })).toMatchObject({
      onboarded: true,
      email_digest: true,
      weekly_digest: true,
    });

    expect(await post({ email_digest: false })).toMatchObject({ email_digest: false, weekly_digest: true });
    expect(await get()).toMatchObject({ email_digest: false, weekly_digest: true });
  } finally {
    await api.dispose();
  }
});
