import type { Db } from "mongodb";

import { reportError } from "./report-error.ts";
/**
 * Append-only trail for privileged mutations (admin/keeper grants, site
 * settings, break-glass bootstrap). If a secret or session is ever
 * compromised, this is what lets a keeper reconstruct what an attacker did —
 * there is no other record of these actions today.
 */
export async function logSecurityEvent(
  db: Db,
  event: {
    action: string;
    actorHandle?: string | null;
    via?: "session" | "bearer";
    detail?: Record<string, unknown>;
    ip?: string;
  }
): Promise<void> {
  try {
    await db.collection("security_audit_log").insertOne({
      action: event.action,
      actor_handle: event.actorHandle ?? null,
      via: event.via ?? "session",
      detail: event.detail ?? {},
      ip: event.ip ?? null,
      created_at: new Date(),
    });
  } catch (e) {
    // Never let logging break the actual admin action.
    console.error("audit log failed:", e);
    reportError(e, { route: "lib/audit", service: "mongodb" });
  }
}
