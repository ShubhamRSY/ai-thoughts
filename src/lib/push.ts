import webpush from "web-push";
import { lookup } from "node:dns/promises";
import net from "node:net";
import type { Db } from "mongodb";
import { reportError } from "./report-error.ts";

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

// The server later POSTs to this URL unattended (via webpush.sendNotification)
// whenever the subscriber gets a notification. Without this check, anyone
// signed in could register their own internal/private URL as their "push
// endpoint" and use the server as an SSRF proxy against internal infra.
const PRIVATE_HOSTNAME_RE =
  /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|::1$|\[::1\]$|(172\.(1[6-9]|2\d|3[0-1]))\.)/i;

/** True when an IP literal is private/loopback/link-local/CGNAT (RFC 1918 + 6300). */
function isPrivateIp(ip: string): boolean {
  if (ip.includes(":")) {
    const lower = ip.toLowerCase();
    return (
      lower === "::1" ||
      lower === "::" ||
      lower.startsWith("fc") || // fc00::/7 unique-local
      lower.startsWith("fd") ||
      lower.startsWith("fe8") || // fe80::/10 link-local
      lower.startsWith("fe9") ||
      lower.startsWith("fea") ||
      lower.startsWith("feb")
    );
  }
  const p = ip.split(".").map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true; // includes 169.254.169.254 cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("dns timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Fail-closed SSRF guard for the URL the server will POST to unattended.
 * A literal-IP blocklist alone is bypassed by DNS names that resolve into
 * private ranges (e.g. metadata.google.internal → 169.254.169.254), so any
 * hostname that isn't already an IP is resolved and every address checked.
 */
export async function isSafePushEndpoint(endpoint: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const hostname = url.hostname.replace(/^\[(.*)\]$/, "$1").toLowerCase();
  if (PRIVATE_HOSTNAME_RE.test(hostname) || isPrivateIp(hostname)) return false;

  if (net.isIP(hostname)) return true;

  // Resolve with a short timeout — serverless functions must not hang on DNS.
  let addresses: string;
  try {
    const res = await withTimeout(lookup(hostname, { all: true }), 3_000);
    addresses = res.map((a) => a.address).join(",");
  } catch {
    return false; // NXDOMAIN / resolution failure → reject
  }
  const ips = addresses.split(",").filter(Boolean);
  if (ips.length === 0) return false;
  // One private address (DNS round-robin, rebinding, geo-ANY) poisons the lot.
  return ips.every((ip) => !isPrivateIp(ip));
}

export async function savePushSubscription(
  db: Db,
  handle: string,
  sub: PushSubscriptionJSON
): Promise<void> {
  if (!(await isSafePushEndpoint(sub.endpoint))) {
    throw new Error("Invalid subscription endpoint");
  }
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

export async function removePushSubscription(
  db: Db,
  endpoint: string,
  handle?: string
): Promise<boolean> {
  const filter = handle
    ? { endpoint, handle: { $in: handleVariants(handle) } }
    : { endpoint };
  return (await db.collection("push_subscriptions").deleteOne(filter)).deletedCount > 0;
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
      if (!(await isSafePushEndpoint(String(s.endpoint || "")))) {
        await db.collection("push_subscriptions").deleteOne({ endpoint: s.endpoint });
        return;
      }
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: s.keys,
          },
          data,
          // One slow push service must not stall the whole fan-out (cron digests).
          { timeout: 10_000 }
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 404 || status === 410) {
          await db.collection("push_subscriptions").deleteOne({ endpoint: s.endpoint });
        } else {
          console.error("push send failed:", err);
          reportError(err, { route: "lib/push", service: "push" });
        }
      }
    })
  );
}
