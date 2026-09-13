import { NextRequest, NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { listDigestRecipients } from "@/lib/prefs";
import { sendActivityDigestEmail } from "@/lib/email";
import { authorizeCron } from "@/lib/cron-auth";

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

export async function GET(request: NextRequest) {
  try {
    if (!authorizeCron(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { db } = await connectToDatabase();
    const recipients = await listDigestRecipients(db, "email_digest");
    let sent = 0;

    for (const r of recipients) {
      const unread = await db
        .collection("notifications")
        .find({
          read: false,
          emailed: { $ne: true },
        })
        .sort({ created_at: -1 })
        .limit(80)
        .toArray();

      const mine = unread.filter(
        (n) => normHandle(String(n.recipient_handle || "")) === normHandle(r.handle)
      );
      if (mine.length === 0) continue;

      const previews = mine.slice(0, 5).map((n) => {
        if (n.kind === "reply") return `${n.actor_author} replied: ${n.preview}`;
        if (n.kind === "follow_post") return `${n.actor_author} shared: ${n.preview}`;
        return `${n.actor_author} reacted ${n.preview}`;
      });

      const ok = await sendActivityDigestEmail(r.email, {
        handle: r.handle,
        count: mine.length,
        previews,
      });
      if (!ok) continue;

      await db.collection("notifications").updateMany(
        { _id: { $in: mine.map((n) => n._id) } },
        { $set: { emailed: true } }
      );
      sent += 1;
    }

    return NextResponse.json({ ok: true, sent, recipients: recipients.length });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
