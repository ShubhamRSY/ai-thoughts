import { test, expect } from "@playwright/test";
import { MongoClient } from "mongodb";

// Your profile lists your own takes even when newer posts have pushed them off
// the first feed page (it used to filter that page, so older takes vanished).

const ORIGIN = new URL(
  process.env.E2E_BASE_URL ?? `http://localhost:${process.env.PORT ?? "3000"}`
).origin;
const MONGO_URL =
  process.env.MONGODB_URL ?? "mongodb://127.0.0.1:27017/aithoughts-e2e?tlsAllowInvalidCertificates=true";
// The dev server (NODE_ENV=development) uses "<db>_dev" — dbName() in src/lib/mongodb.ts.
const MONGO_DB = ((b) => (b.endsWith("_dev") ? b : `${b}_dev`))(process.env.MONGODB_DB ?? "aithoughts-e2e");
const ip = () => `10.79.${test.info().retry}.1`;

test("profile shows own takes older than the first feed page", async ({ page }) => {
  await page.context().setExtraHTTPHeaders({ "X-Forwarded-For": ip() });
  const email = `e2e-profile-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  const headers = { "X-Forwarded-For": ip() };
  const { devCode } = await (await page.request.post("/api/auth/sign-in", { data: { email }, headers })).json();
  const verify = await page.request.post("/api/auth/verify", {
    data: { email, code: devCode, age_confirmed: true },
    headers,
  });
  expect(verify.ok(), await verify.text()).toBeTruthy();
  await page.request.post("/api/prefs", { data: { onboarded: true }, headers: { Origin: ORIGIN } });

  const content = `my old take ${Date.now()}`;
  const posted = await page.request.post("/api/posts", {
    data: { content, media_type: "text" },
    headers: { Origin: ORIGIN },
  });
  expect(posted.ok(), await posted.text()).toBeTruthy();

  // Bury it under more than a feed page (FEED_PAGE_SIZE = 40) of newer posts.
  const mongo = await new MongoClient(MONGO_URL, { tls: true }).connect();
  const filler = `@e2efiller${Date.now().toString(36)}`;
  try {
    const now = Date.now();
    await mongo
      .db(MONGO_DB)
      .collection("posts")
      .insertMany(
        Array.from({ length: 45 }, (_, i) => ({
          handle: filler,
          author: "Filler",
          content: `filler ${i}`,
          media_type: "text",
          created_at: new Date(now + 1000 + i),
        }))
      );

    await page.goto("/app");
    await page.getByRole("button", { name: "You", exact: true }).first().click();
    await expect(page.getByText(content)).toBeVisible();
  } finally {
    await mongo.db(MONGO_DB).collection("posts").deleteMany({ handle: filler });
    await mongo.close();
  }
});
