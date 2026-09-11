import { getSiteUrl } from "@/lib/site";

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from =
    process.env.EMAIL_FROM?.trim() || "AI·Thoughts <onboarding@resend.dev>";

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
      <p style="font-size:14px;color:#71717a;margin:0 0 16px">AI·Thoughts — The Public Pulse</p>
      <h1 style="font-size:22px;margin:0 0 12px">Your sign-in code</h1>
      <p style="font-size:32px;letter-spacing:0.35em;font-weight:700;margin:24px 0;font-family:ui-monospace,monospace">${code}</p>
      <p style="font-size:14px;color:#52525b;line-height:1.5">
        Expires in 10 minutes. If you didn't request this, you can ignore this email.
      </p>
    </div>
  `;

  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not configured");
    }
    console.info(`[dev] OTP for ${to}: ${code}`);
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, text, html }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("Resend error:", res.status, body);
    throw new Error("Failed to send email");
  }
}
