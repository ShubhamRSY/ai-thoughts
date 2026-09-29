import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { connectToDatabase } from "@/lib/mongodb";
import {
  requireAdminSession,
  listAdmins,
  listKeepers,
  addAdmin,
  removeAdmin,
  addKeeper,
  removeKeeper,
  setUserVerified,
  getSiteSettings,
  setSiteSettings,
} from "@/lib/admin";
import { authorizeBearer } from "@/lib/cron-auth";
import { logSecurityEvent } from "@/lib/audit";
import { clientIp } from "@/lib/rate-limit";
import { collectSentimentSnapshot } from "@/lib/sentiment";
import { reportError } from "@/lib/report-error";

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

/**
 * GET /api/admin/controls — global snapshot for the admin console.
 * POST — mutate keepers/admins/settings/delete post/seed via session admin.
 * Also accepts Bearer OWNER_DASHBOARD_SECRET|CRON_SECRET for bootstrap claim.
 */
export async function GET() {
  const gate = await requireAdminSession();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  try {
    const { db } = await connectToDatabase();
    const [admins, keepers, settings, users, posts, reportsOpen, messages, auditRows, sentiment] =
      await Promise.all([
        listAdmins(),
        listKeepers(),
        getSiteSettings(),
        db.collection("users").countDocuments(),
        db.collection("posts").countDocuments(),
        db.collection("reports").countDocuments({ status: { $ne: "resolved" } }),
        db.collection("messages").countDocuments(),
        db
          .collection("security_audit_log")
          .find({})
          .sort({ created_at: -1 })
          .limit(50)
          .toArray(),
        collectSentimentSnapshot(db),
      ]);

    const recentPosts = await db
      .collection("posts")
      .find({})
      .sort({ created_at: -1 })
      .limit(12)
      .project({ handle: 1, author: 1, content: 1, created_at: 1, feeling: 1 })
      .toArray();

    const verifiedRows = await db
      .collection<{ handle?: string }>("users")
      .find({ verified: true })
      .project({ handle: 1 })
      .limit(200)
      .toArray();
    const verifiedUsers = verifiedRows
      .map((u) => (u.handle ?? "").trim())
      .filter(Boolean)
      .sort();

    return NextResponse.json({
      ok: true,
      you: {
        handle: gate.session.handle,
        displayName: gate.session.displayName,
      },
      stats: {
        users,
        posts,
        messages,
        reportsOpen,
      },
      settings,
      admins,
      keepers,
      verifiedUsers,
      sentiment,
      auditLog: auditRows.map((r) => ({
        id: r._id.toString(),
        action: r.action,
        actor_handle: r.actor_handle ?? null,
        via: r.via ?? "session",
        detail: r.detail ?? {},
        ip: r.ip ?? null,
        created_at:
          r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ""),
      })),
      recentPosts: recentPosts.map((p) => ({
        id: p._id.toString(),
        handle: p.handle,
        author: p.author,
        feeling: p.feeling ?? null,
        content: String(p.content || "").slice(0, 160),
        created_at:
          p.created_at instanceof Date
            ? p.created_at.toISOString()
            : String(p.created_at ?? ""),
      })),
    });
  } catch (e) {
    console.error(e);
    reportError(e, { route: "api/admin/controls" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "";

  // Break-glass: claim admin for a handle using owner/cron secret (once).
  if (action === "bootstrap") {
    if (
      !(await authorizeBearer(request, {
        secrets: [process.env.OWNER_DASHBOARD_SECRET, process.env.CRON_SECRET],
        allowInsecureDev: true, // still needs ALLOW_INSECURE_DEV_AUTH=1, see cron-auth.ts
      }))
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const handle = typeof body.handle === "string" ? body.handle.trim() : "";
    if (!handle) {
      return NextResponse.json({ error: "handle required" }, { status: 400 });
    }
    try {
      await addAdmin(handle);
      const { db } = await connectToDatabase();
      await logSecurityEvent(db, {
        action: "bootstrap_admin",
        actorHandle: `@${normHandle(handle)}`,
        via: "bearer",
        ip: clientIp(request),
      });
      return NextResponse.json({ ok: true, handle: `@${normHandle(handle)}` });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed" },
        { status: 400 }
      );
    }
  }

  const gate = await requireAdminSession();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const audit = (auditAction: string, detail?: Record<string, unknown>) =>
    connectToDatabase().then(({ db }) =>
      logSecurityEvent(db, {
        action: auditAction,
        actorHandle: gate.session.handle,
        via: "session",
        detail,
        ip: clientIp(request),
      })
    );

  try {
    switch (action) {
      case "add_keeper": {
        const handle = String(body.handle || "").trim();
        if (!handle) return NextResponse.json({ error: "handle required" }, { status: 400 });
        await addKeeper(handle);
        await audit("add_keeper", { handle: `@${normHandle(handle)}` });
        return NextResponse.json({ ok: true, keepers: await listKeepers() });
      }
      case "remove_keeper": {
        const handle = String(body.handle || "").trim();
        if (!handle) return NextResponse.json({ error: "handle required" }, { status: 400 });
        await removeKeeper(handle);
        await audit("remove_keeper", { handle: `@${normHandle(handle)}` });
        return NextResponse.json({ ok: true, keepers: await listKeepers() });
      }
      case "verify_user": {
        const handle = String(body.handle || "").trim();
        if (!handle) return NextResponse.json({ error: "handle required" }, { status: 400 });
        await setUserVerified(handle, true);
        await audit("verify_user", { handle: `@${normHandle(handle)}` });
        return NextResponse.json({ ok: true });
      }
      case "unverify_user": {
        const handle = String(body.handle || "").trim();
        if (!handle) return NextResponse.json({ error: "handle required" }, { status: 400 });
        await setUserVerified(handle, false);
        await audit("unverify_user", { handle: `@${normHandle(handle)}` });
        return NextResponse.json({ ok: true });
      }
      case "add_admin": {
        const handle = String(body.handle || "").trim();
        if (!handle) return NextResponse.json({ error: "handle required" }, { status: 400 });
        await addAdmin(handle);
        await audit("add_admin", { handle: `@${normHandle(handle)}` });
        return NextResponse.json({ ok: true, admins: await listAdmins() });
      }
      case "remove_admin": {
        const handle = String(body.handle || "").trim();
        if (!handle) return NextResponse.json({ error: "handle required" }, { status: 400 });
        if (normHandle(handle) === normHandle(gate.session.handle)) {
          return NextResponse.json({ error: "Cannot remove yourself" }, { status: 400 });
        }
        await removeAdmin(handle);
        await audit("remove_admin", { handle: `@${normHandle(handle)}` });
        return NextResponse.json({ ok: true, admins: await listAdmins() });
      }
      case "settings": {
        if (typeof body.featuredPostId === "string" && body.featuredPostId && !ObjectId.isValid(body.featuredPostId)) {
          return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
        }
        const settings = await setSiteSettings({
          maintenance: typeof body.maintenance === "boolean" ? body.maintenance : undefined,
          maintenanceMessage:
            typeof body.maintenanceMessage === "string" ? body.maintenanceMessage : undefined,
          invitesOpen: typeof body.invitesOpen === "boolean" ? body.invitesOpen : undefined,
          featuredPostId: typeof body.featuredPostId === "string" ? body.featuredPostId : undefined,
        });
        await audit("settings", settings);
        return NextResponse.json({ ok: true, settings });
      }
      case "delete_post": {
        const id = String(body.postId || "").trim();
        let oid: ObjectId;
        try {
          oid = new ObjectId(id);
        } catch {
          return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
        }
        const { db } = await connectToDatabase();
        const post = await db.collection("posts").findOne({ _id: oid });
        if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
        await db.collection("posts").deleteOne({ _id: oid });
        await db.collection("messages").deleteMany({ post_id: id });
        await db.collection("reactions").deleteMany({ post_id: id });
        await db.collection("reports").deleteMany({ post_id: id });
        await audit("delete_post", { postId: id, authorHandle: post.handle });
        return NextResponse.json({ ok: true, deleted: id });
      }
      case "seed": {
        // Reuse admin seed route logic via internal fetch would need secret —
        // call catalog insert inline lightly by hitting the same collection pattern.
        const { GLOBAL_SEED_POSTS } = await import("@/lib/seed-posts");
        const { createHash } = await import("crypto");
        const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);
        const { db } = await connectToDatabase();
        await db.collection("posts").createIndex({ seed_id: 1 }, { unique: true, sparse: true });
        const ids = GLOBAL_SEED_POSTS.map((p) => p.seed_id);
        const existing = await db
          .collection("posts")
          .find({ seed_id: { $in: ids } }, { projection: { seed_id: 1 } })
          .toArray();
        const have = new Set(existing.map((p) => p.seed_id as string));
        const docs = GLOBAL_SEED_POSTS.filter((p) => !have.has(p.seed_id)).map((p) => ({
          seed_id: p.seed_id,
          handle: p.handle,
          author: p.author,
          content: p.content,
          media_type: "text" as const,
          feeling: p.feeling,
          tags: p.tags,
          language: p.language,
          language_label: p.language_label,
          integrity_hash: hash(`${p.seed_id}:${p.handle}:${p.content}`),
          integrity_verified: false,
          integrity_label: "Sample voice",
          is_seed: true,
          created_at: new Date(Date.now() - p.hours * 3600e3),
          user_id: new ObjectId().toString(),
        }));
        if (docs.length > 0) await db.collection("posts").insertMany(docs);
        await db.collection("posts").updateMany(
          { $or: [{ seed_id: { $exists: true, $ne: null } }, { is_seed: true }] },
          { $set: { integrity_verified: false, integrity_label: "Sample voice", is_seed: true } }
        );
        const total = await db.collection("posts").countDocuments();
        return NextResponse.json({
          ok: true,
          inserted: docs.length,
          already: have.size,
          total,
        });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Something went wrong" },
      { status: 400 }
    );
  }
}
