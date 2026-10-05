import { NextRequest, NextResponse } from "next/server";
import type { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import { listDigestRecipients } from "@/lib/prefs";
import { activityDigestEmail, sendEmailBatch } from "@/lib/email";
import { authorizeCron } from "@/lib/cron-auth";
import { reportError } from "@/lib/report-error";
import { handleVariants } from "@/lib/visibility";

export const maxDuration = 60;

const QUERY_CONCURRENCY = 25;

export async function GET(request: NextRequest) {
  try {
    if (!(await authorizeCron(request))) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const recipients = await listDigestRecipients(db, "email_digest");

    // Look up everyone's unread rows in parallel groups (each query is served
    // by notifications_recipient_created; the limit is per recipient).
    const pending: { email: string; handle: string; ids: ObjectId[]; previews: string[] }[] = [];
    for (let i = 0; i < recipients.length; i += QUERY_CONCURRENCY) {
      const group = recipients.slice(i, i + QUERY_CONCURRENCY);
      const rows = await Promise.all(
        group.map((r) =>
          db
            .collection("notifications")
            .find(
              {
                recipient_handle: { $in: handleVariants(r.handle) },
                read: false,
                emailed: { $ne: true },
                // new_signin gets its own immediate alert email the moment it
                // happens. Listing it here too would mail the same event twice,
                // and a stale "new sign-in" line in a daily digest is alarming
                // days after the fact and tells the owner nothing.
                kind: { $ne: "new_signin" },
              },
              { projection: { kind: 1, actor_author: 1, preview: 1 } }
            )
            .sort({ created_at: -1 })
            .limit(80)
            .toArray()
        )
      );
      group.forEach((r, j) => {
        const mine = rows[j];
        if (mine.length === 0) return;
        pending.push({
          email: r.email,
          handle: r.handle,
          ids: mine.map((n) => n._id),
          previews: mine.slice(0, 5).map((n) => {
            if (n.kind === "reply") return `${n.actor_author} replied: ${n.preview}`;
            if (n.kind === "follow_post") return `${n.actor_author} shared: ${n.preview}`;
            if (n.kind === "mention") return `${n.actor_author} mentioned you: ${n.preview}`;
            return `${n.actor_author} reacted ${n.preview}`;
          }),
        });
      });
    }

    const accepted = await sendEmailBatch(
      pending.map((p) => activityDigestEmail(p.email, { handle: p.handle, count: p.ids.length, previews: p.previews })),
      "api/cron/activity-digest"
    );
    const delivered = pending.filter((_, i) => accepted[i]);
    // Only messages Resend returned an id for are marked; the rest stay
    // unemailed and are picked up by tomorrow's run.
    if (delivered.length) {
      await db.collection("notifications").updateMany(
        { _id: { $in: delivered.flatMap((p) => p.ids) } },
        { $set: { emailed: true } }
      );
    }
    const sent = delivered.length;

    return NextResponse.json({ ok: true, sent, recipients: recipients.length });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/cron/activity-digest" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
