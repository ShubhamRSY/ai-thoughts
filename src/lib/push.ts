import webpush from "web-push";
import type { Db } from "mongodb";

export type PushSubscriptionJSON = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
};

function vapidConfigured(): boolean {
  return Boolean(
    process.env.VAPID_PUBLIC_KEY?.trim() &&
      process.env.VAPID_PRIVATE_KEY?.trim()
  );
}

export function getVapidPublicKey(): string | null {
  return process.env.VAPID_PUBLIC_KEY?.trim() || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() || null;
}

function configureWebPush() {
  if (!vapidConfigured()) return false;
  const subject =
    process.env.VAPID_SUBJECT?.trim() || "mailto:keepers@aito.social";
  webpush.setVapidDetails(
    subject,
    process.env.VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim()
  );
  return true;
}

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

function handleVariants(h: string): string[] {
  const n = normHandle(h);
  return Array.from(new Set([h, `@${n}`, n]));
}

export async function savePushSubscription(
  db: Db,
  handle: string,
  sub: PushSubscriptionJSON
): Promise<void> {
  await db.collection("push_subscriptions").updateOne(
    { endpoint: sub.endpoint },
    {
      $set: {
        handle,
        endpoint: sub.endpoint,
        keys: sub.keys,
        updated_at: new Date(),
      },
      $setOnInsert: { created_at: new Date() },
    },
    { upsert: true }
  );
}

export async function removePushSubscription(db: Db, endpoint: string): Promise<void> {
  await db.collection("push_subscriptions").deleteOne({ endpoint });
}

export async function sendPushToHandle(
  db: Db,
  handle: string,
  payload: { title: string; body: string; url?: string; tag?: string }
): Promise<void> {
  if (!configureWebPush()) return;

  const variants = handleVariants(handle);
  const subs = await db
    .collection("push_subscriptions")
    .find({ handle: { $in: variants } })
    .toArray();

  // Casing fallback
  if (subs.length === 0) {
    const all = await db.collection("push_subscriptions").find({}).limit(200).toArray();
    for (const s of all) {
      if (normHandle(String(s.handle || "")) === normHandle(handle)) subs.push(s);
    }
  }

  const data = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/app",
    tag: payload.tag || "aithoughts",
  });

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: s.keys,
          },
          data
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await db.collection("push_subscriptions").deleteOne({ endpoint: s.endpoint });
        } else {
          console.error("push send failed:", err);
        }
      }
    })
  );
}
