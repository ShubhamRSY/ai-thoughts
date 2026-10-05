import { getSiteUrl } from "@/lib/site";
import { reportError } from "./report-error.ts";

export class EmailDeliveryError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_configured"
      | "test_domain"
      | "provider"
      | "failed" = "failed"
  ) {
    super(message);
    this.name = "EmailDeliveryError";
  }
}

function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || "AI·Thoughts <onboarding@resend.dev>";
}

function usingResendTestDomain(from: string): boolean {
  return /@resend\.dev>/i.test(from) || /@resend\.dev$/i.test(from);
}

export type EmailMessage = { to: string; subject: string; text: string; html: string };

/** Resend credentials, or null in dev without a key (emails are logged instead). */
function resendSender(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = fromAddress();

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new EmailDeliveryError(
        "Email delivery is not configured",
        "not_configured"
      );
    }
    return null;
  }

  // Permanent requirement: production must send from a verified custom domain.
  // onboarding@resend.dev can only email the Resend account owner.
  if (process.env.NODE_ENV === "production" && usingResendTestDomain(from)) {
    throw new EmailDeliveryError(
      "Sign-in email isn’t ready for everyone yet. The host must verify a custom domain on Resend and set EMAIL_FROM (not @resend.dev).",
      "test_domain"
    );
  }
  return { apiKey, from };
}

const RESEND_BATCH_MAX = 100;

/**
 * Bulk send (digests) through Resend's batch endpoint: up to 100 emails per
 * request, so 500 recipients is 5 calls instead of 500 sequential ones.
 * The result is per message: true only when the response carries an id at
 * that message's index (`{ data: [{ id }] }`, same order as the payload).
 * In Resend's default (strict) validation one invalid email fails the whole
 * request, so that chunk comes back all false and is retried next run.
 * Never throws — failures are reported.
 */
export async function sendEmailBatch(messages: EmailMessage[], route: string): Promise<boolean[]> {
  let sender: { apiKey: string; from: string } | null;
  try {
    sender = resendSender();
  } catch (e) {
    reportError(e, { route, service: "resend" });
    return messages.map(() => false);
  }
  if (!sender) {
    for (const m of messages) console.info(`[dev] email to ${m.to}: ${m.subject}\n${m.text}`);
    return messages.map(() => true);
  }
  const { apiKey, from } = sender;

  const chunks: EmailMessage[][] = [];
  for (let i = 0; i < messages.length; i += RESEND_BATCH_MAX) chunks.push(messages.slice(i, i + RESEND_BATCH_MAX));
  // Sequential: a handful of requests, and it stays well inside Resend's per-second limit.
  const results: boolean[] = [];
  for (const chunk of chunks) {
    let accepted: boolean[] = chunk.map(() => false);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(chunk.map((m) => ({ from, to: [m.to], subject: m.subject, text: m.text, html: m.html }))),
        signal: AbortSignal.timeout(15_000),
      });
      const body = await res.text().catch(() => "");
      if (res.ok) {
        let data: unknown = null;
        try {
          data = JSON.parse(body)?.data;
        } catch {
          /* unreadable body: treat as nothing accepted */
        }
        accepted = chunk.map((_, i) => Array.isArray(data) && typeof data[i]?.id === "string");
        const dropped = accepted.filter((a) => !a).length;
        if (dropped) {
          reportError(new Error(`Resend batch: ${dropped}/${chunk.length} emails not accepted`), { route, service: "resend" });
        }
      } else {
        console.error("Resend batch error:", res.status, body);
        reportError(new Error(`Resend batch ${res.status}: ${body.slice(0, 200)}`), { route, service: "resend" });
      }
    } catch (e) {
      console.error("Resend batch failed:", e);
      reportError(e, { route, service: "resend" });
    }
    results.push(...accepted);
  }
  return results;
}

async function sendEmail(opts: EmailMessage): Promise<void> {
  const sender = resendSender();
  if (!sender) {
    console.info(`[dev] email to ${opts.to}: ${opts.subject}\n${opts.text}`);
    return;
  }
  const { apiKey, from } = sender;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [opts.to],
      subject: opts.subject,
      text: opts.text,
      html: opts.html,
    }),
    // A hung provider must not hold the sign-in request open until the platform kills it.
    signal: AbortSignal.timeout(10_000),
  });

  if (res.ok) return;

  const body = await res.text().catch(() => "");
  console.error("Resend error:", res.status, body);

  const lower = body.toLowerCase();
  let providerMessage = "";
  try {
    providerMessage = String(JSON.parse(body)?.message || "");
  } catch {
    providerMessage = body.slice(0, 200);
  }

  if (
    usingResendTestDomain(from) ||
    lower.includes("only send testing emails") ||
    lower.includes("you can only send") ||
    lower.includes("verify a domain") ||
    lower.includes("domain is not verified") ||
    lower.includes("not verified")
  ) {
    throw new EmailDeliveryError(
      providerMessage
        ? `${providerMessage} Use the Resend account that owns your Vercel RESEND_API_KEY, open Domains, and confirm status is Verified.`
        : "Couldn’t deliver the sign-in email. The sending domain must be verified on Resend.",
      "test_domain"
    );
  }

  throw new EmailDeliveryError(
    providerMessage || "Could not send email right now. Try again in a minute.",
    "provider"
  );
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const subject = `${code} is your AI·Thoughts sign-in code`;
  const text = [
    `Your sign-in code is: ${code}`,
    "",
    "It expires in 10 minutes. If you didn't request this, you can ignore this email.",
    "",
    `— AI·Thoughts (${getSiteUrl()})`,
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#18181b">
      <p style="font-size:14px;color:#71717a;margin:0 0 16px">AI·Thoughts</p>
      <h1 style="font-size:22px;margin:0 0 12px">Your sign-in code</h1>
      <p style="font-size:32px;letter-spacing:0.35em;font-weight:700;margin:24px 0;font-family:ui-monospace,monospace">${code}</p>
      <p style="font-size:14px;color:#52525b;line-height:1.5">
        Expires in 10 minutes. If you didn't request this, you can ignore this email.
      </p>
    </div>
  `;

  await sendEmail({ to, subject, text, html });
}

/**
 * Sent when an account is opened on a device it hasn't been used from before.
 * With email-only login a stolen inbox is a stolen account, so the owner hears
 * about each new device — and gets both answers from the same email: keep it, or
 * end that one device without signing in.
 */
export async function sendSignInAlertEmail(
  to: string,
  deviceLabel: string,
  revokeUrl?: string
): Promise<void> {
  const when = new Date().toUTCString();
  const shownDevice = deviceLabel.slice(0, 160) || "Unknown device";
  const devicesUrl = `${getSiteUrl()}/app?view=account`;
  // Without a token the email can only point at the device list, which needs a
  // sign-in. That still beats silence, so it degrades rather than skips.
  const action = revokeUrl
    ? [
        `If that was you: nothing to do.`,
        `If it wasn't: end that device here — ${revokeUrl}`,
        `Or review every device: ${devicesUrl}`,
      ]
    : [`If that was you: nothing to do.`, `Review every device: ${devicesUrl}`];
  const text = ["New sign-in to your AI·Thoughts account", "", `Device: ${shownDevice}`, `Time: ${when}`, "", ...action].join("\n");
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#18181b">
      <p style="font-size:14px;color:#71717a;margin:0 0 16px">AI·Thoughts</p>
      <h1 style="font-size:20px;margin:0 0 12px">New sign-in to your account</h1>
      <p style="font-size:14px;line-height:1.5;margin:0">Device: ${escapeHtml(shownDevice)}<br>Time: ${when}</p>
      <p style="font-size:14px;color:#52525b;line-height:1.5">
        If that was you, you can ignore this email.
      </p>
      ${
        revokeUrl
          ? `<p style="margin:0 0 4px">
        <a href="${escapeHtml(revokeUrl)}" style="display:inline-block;background:#18181b;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:9999px;font-size:14px;font-weight:600">Wasn't me — end this device</a>
      </p>
      <p style="font-size:13px;color:#71717a;line-height:1.5;margin:8px 0 0">
        The link expires in 30 minutes. Prefer to look first? <a href="${devicesUrl}">Review every device</a>.
      </p>`
          : `<p style="font-size:13px;color:#71717a;line-height:1.5;margin:8px 0 0">
        <a href="${devicesUrl}">Review every device</a>
      </p>`
      }
    </div>
  `;
  await sendEmail({ to, subject: "New sign-in to AI·Thoughts", text, html });
}

export function activityDigestEmail(
  to: string,
  opts: { handle: string; count: number; previews: string[] }
): EmailMessage {
  const site = getSiteUrl();
  const subject =
    opts.count === 1
      ? `1 person engaged with your take on AI·Thoughts`
      : `${opts.count} people engaged with your takes on AI·Thoughts`;

  const lines = opts.previews.slice(0, 5).map((p) => `• ${p}`);
  const text = [
    `Hi ${opts.handle},`,
    "",
    subject.replace(" on AI·Thoughts", "."),
    "",
    ...lines,
    "",
    `Open Voices: ${site}/app`,
    "",
    "Turn digests off anytime in You → Daily habits.",
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#18181b">
      <p style="font-size:13px;color:#71717a;margin:0 0 8px">AI·Thoughts · Activity</p>
      <h1 style="font-size:20px;margin:0 0 12px">${subject}</h1>
      <ul style="padding-left:18px;color:#3f3f46;font-size:14px;line-height:1.5">
        ${opts.previews
          .slice(0, 5)
          .map((p) => `<li style="margin-bottom:8px">${escapeHtml(p)}</li>`)
          .join("")}
      </ul>
      <p style="margin:24px 0">
        <a href="${site}/app" style="display:inline-block;background:#1f4d45;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-size:14px;font-weight:600">Open Voices</a>
      </p>
      <p style="font-size:12px;color:#a1a1aa">You can turn digests off in You → Daily habits.</p>
    </div>
  `;

  return { to, subject, text, html };
}

export function weeklyVoicesEmail(
  to: string,
  opts: {
    handle: string;
    episodeTitle: string;
    topFeeling: string;
    takeCount: number;
    highlights: { author: string; content: string }[];
  }
): EmailMessage {
  const site = getSiteUrl();
  const subject = `Weekly Voices: ${opts.episodeTitle}`;
  const text = [
    `Hi ${opts.handle},`,
    "",
    subject,
    `${opts.takeCount} takes · people felt mostly ${opts.topFeeling}`,
    "",
    ...opts.highlights.map((h) => `• ${h.author}: ${h.content}`),
    "",
    `Read the episode: ${site}/app`,
  ].join("\n");

  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#18181b">
      <p style="font-size:13px;color:#71717a;margin:0 0 8px">AI·Thoughts · Weekly Voices</p>
      <h1 style="font-size:22px;margin:0 0 8px">${escapeHtml(opts.episodeTitle)}</h1>
      <p style="font-size:14px;color:#52525b;margin:0 0 16px">${opts.takeCount} takes · mostly ${escapeHtml(opts.topFeeling)}</p>
      ${opts.highlights
        .map(
          (h) => `
        <div style="border-top:1px solid #e4e4e7;padding:12px 0">
          <p style="margin:0;font-size:13px;font-weight:600">${escapeHtml(h.author)}</p>
          <p style="margin:4px 0 0;font-size:14px;color:#3f3f46;line-height:1.45">${escapeHtml(h.content)}</p>
        </div>`
        )
        .join("")}
      <p style="margin:24px 0">
        <a href="${site}/app" style="display:inline-block;background:#1f4d45;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none;font-size:14px;font-weight:600">Open this week’s Voices</a>
      </p>
    </div>
  `;

  return { to, subject, text, html };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
