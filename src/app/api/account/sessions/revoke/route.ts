import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { verifySessionActionToken } from "@/lib/auth";
import { revokeSession } from "@/lib/sessions";
import { reportError } from "@/lib/report-error";

export const dynamic = "force-dynamic";

/**
 * The "Wasn't me — end this device" link in the new-sign-in email. It carries a
 * short-lived signed token (lib/auth.ts) so the owner doesn't have to sign in
 * to act on an alert about a sign-in they don't recognise — which is the whole
 * point: a stranger using their inbox shouldn't need their password to be
 * locked out, and the rightful owner shouldn't have to hunt for it either.
 *
 * Scope is deliberately one session, named in the token, scoped to one user id.
 * It cannot revoke anything else, and it is not a login.
 */

const page = (title: string, body: string) => `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · AI·Thoughts</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fafafa;color:#18181b;
       font:16px/1.6 system-ui,-apple-system,sans-serif;padding:24px}
  .card{max-width:26rem;background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:28px}
  h1{font-size:1.25rem;margin:0 0 8px} p{margin:0 0 12px;color:#52525b}
  a{color:#18181b;font-weight:600}
  .mark{font-size:13px;color:#a1a1aa;margin:0 0 16px}
</style></head>
<body><div class="card"><p class="mark">AI·Thoughts</p><h1>${title}</h1><p>${body}</p>
<p><a href="/">Back to Voices</a></p></div></body></html>`;

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") ?? "";
  const claims = await verifySessionActionToken(token);

  if (!claims) {
    return new NextResponse(
      page(
        "This link has expired",
        "Security links are good for 30 minutes. Open Account &rarr; Devices to end any session."
      ),
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }

  let ended = false;
  try {
    const { db } = await connectToDatabase();
    ended = await revokeSession(db, claims.userId, claims.sid);
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/account/sessions/revoke" });
    return new NextResponse(
      page("Something went wrong", "We couldn't reach the session store. Nothing was changed — try again in a moment."),
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  // Deliberately no cookie clearing here. This link is usually opened on the
  // *other* device — the owner's laptop, not the intruder they just revoked —
  // and clearing there would sign out a perfectly good session. Same reason the
  // signed-in "end this device" button doesn't clear either. If the link was
  // opened on the device it just ended, proxy.ts sees a revoked session on the
  // next navigation and redirects to sign-in.
  return new NextResponse(
    ended
      ? page(
          "That device is signed out",
          "The session this link pointed at has ended. If anything still looks wrong, review every device."
        )
      : page("Already ended", "That session was no longer active — nothing to do."),
    { status: ended ? 200 : 410, headers: { "Cache-Control": "no-store" } }
  );
}