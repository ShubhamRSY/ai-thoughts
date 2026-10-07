import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import type { Db } from "mongodb";
import { checkDignity } from "@/lib/dignity";
import { flaggedBody, isFlaggedContent } from "@/lib/content-moderation";
import { rateLimit } from "@/lib/rate-limit";
import { sendPushToHandle } from "@/lib/push";
import { reportError } from "@/lib/report-error";
import { MAX_DM_LENGTH, type DmUser } from "@/lib/dms";
import { postingPausedError, recordStrike, swearingLimitError, type Offender } from "@/lib/strikes";

/**
 * Same bar as a reply: per-account rate limit, posting pause, dignity check,
 * AI screening; blocked text counts as a strike.
 * Returns the cleaned text, or the response to send back instead.
 */
export async function screenDm(db: Db, sender: Offender, raw: unknown): Promise<string | NextResponse> {
  const { ok, retryInSec } = await rateLimit(`dm:${sender.id}`, 30, 60_000);
  if (!ok) return NextResponse.json({ error: "You're sending too fast — slow down", retry_in_sec: retryInSec }, { status: 429 });
  const paused = await postingPausedError(db, sender.id);
  if (paused) return NextResponse.json({ error: paused, code: "paused" }, { status: 403 });
  const body = typeof raw === "string" ? raw.trim().slice(0, MAX_DM_LENGTH) : "";
  if (!body) return NextResponse.json({ error: "Empty message" }, { status: 400 });
  const dignity = checkDignity(body);
  if (!dignity.ok) {
    const pause = dignity.abuse ? await recordStrike(db, sender, "message", body) : "";
    return NextResponse.json({ error: dignity.reason + pause }, { status: 400 });
  }
  if (await isFlaggedContent({ text: body })) {
    const flagged = flaggedBody("message");
    const pause = await recordStrike(db, sender, "message", body);
    return NextResponse.json({ ...flagged, error: flagged.error + pause }, { status: 400 });
  }
  const swearing = await swearingLimitError(db, sender.id, body);
  if (swearing) return NextResponse.json({ error: swearing, code: "swearing" }, { status: 400 });
  return body;
}

/** Push the recipient, off the request path. A request doesn't reveal its text. */
export function pushDm(db: Db, opts: { to: DmUser; from: DmUser; conversationId: string; body: string; request: boolean }) {
  waitUntil(
    sendPushToHandle(db, opts.to.handle, {
      title: opts.from.displayName,
      body: opts.request ? "wants to send you a message" : opts.body.slice(0, 120),
      url: `/app?dm=${opts.conversationId}`,
      tag: `dm-${opts.conversationId}`,
    }).catch((e) => reportError(e, { route: "api/dms", service: "push" }))
  );
}

export const serializeDm = (m: { _id: { toString(): string }; sender_id: string; body: string; created_at: Date }, me: string) => ({
  id: m._id.toString(),
  from_me: m.sender_id === me,
  body: m.body,
  created_at: m.created_at.toISOString(),
});
