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

async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = fromAddress();

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new EmailDeliveryError(
        "Email delivery is not configured",
        "not_configured"
      );
    }
    console.info(`[dev] email to ${opts.to}: ${opts.subject}\n${opts.text}`);
    return;
  }

  // Permanent requirement: production must send from a verified custom domain.
  // onboarding@resend.dev can only email the Resend account owner.
  if (process.env.NODE_ENV === "production" && usingResendTestDomain(from)) {
    throw new EmailDeliveryError(
      "Sign-in email isn’t ready for everyone yet. The host must verify a custom domain on Resend and set EMAIL_FROM (not @resend.dev).",
      "test_domain"
    );
  }

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
 * Sent on every sign-in to an existing account. With email-only login a stolen
 * inbox is a stolen account, so the owner hears about each new device and can
 * end it from Account → Devices.
 */
export async function sendSignInAlertEmail(to: string, device: string): Promise<void> {
  const when = new Date().toUTCString();
  const shownDevice = device.slice(0, 160) || "Unknown device";
  const devicesUrl = `${getSiteUrl()}/app?view=account`;
  const text = [
    "New sign-in to your AI·Thoughts account",
    "",
    `Device: ${shownDevice}`,
    `Time: ${when}`,
    "",
    `If this wasn't you, sign out everywhere: ${devicesUrl}`,
  ].join("\n");
  const html = `
    <div style="font-family:system-ui,-apple-system,sans-serif;max-width:420px;margin:0 auto;padding:24px;color:#18181b">
      <p style="font-size:14px;color:#71717a;margin:0 0 16px">AI·Thoughts</p>
      <h1 style="font-size:20px;margin:0 0 12px">New sign-in to your account</h1>
      <p style="font-size:14px;line-height:1.5;margin:0">Device: ${escapeHtml(shownDevice)}<br>Time: ${when}</p>
      <p style="font-size:14px;color:#52525b;line-height:1.5">
        If this wasn't you, <a href="${devicesUrl}">sign out everywhere</a>.
      </p>
    </div>
  `;
  await sendEmail({ to, subject: "New sign-in to AI·Thoughts", text, html });
}

export async function sendActivityDigestEmail(
  to: string,
  opts: { handle: string; count: number; previews: string[] }
): Promise<boolean> {
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

  try {
    await sendEmail({ to, subject, text, html });
    return true;
  } catch (e) {
    console.error("activity digest email failed:", e);
    reportError(e, { route: "lib/email:activity-digest", service: "resend" });
    return false;
  }
}

export async function sendWeeklyVoicesEmail(
  to: string,
  opts: {
    handle: string;
    episodeTitle: string;
    topFeeling: string;
    takeCount: number;
    highlights: { author: string; content: string }[];
  }
): Promise<boolean> {
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

  try {
    await sendEmail({ to, subject, text, html });
    return true;
  } catch (e) {
    console.error("weekly voices email failed:", e);
    reportError(e, { route: "lib/email:weekly-voices", service: "resend" });
    return false;
  }
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
