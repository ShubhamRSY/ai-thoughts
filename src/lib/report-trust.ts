import { ObjectId, type Db } from "mongodb";
import { CHILD_SAFETY } from "./report-reasons.ts";

// Child-safety reports hide a take at once — that speed matters and stays.
// But any member used to be able to hide any take by filing one, so a group of
// fresh accounts could take down whatever they liked (SECURITY_AUDIT.md M3).
// Every child-safety report is still filed at top priority for keepers; what
// is gated is the *instant* hide:
//   - a trusted reporter hides it alone;
//   - otherwise it hides once enough independent people have reported it.
// Reporters whose child-safety reports keepers keep rejecting lose trust.
// (No "@/" imports at module level — the rules are unit-tested with plain node.)

const DAY_MS = 864e5;
export const TRUSTED_MIN_AGE_MS = 7 * DAY_MS;
export const AGED_REPORTER_MS = DAY_MS;
export const REJECTION_WINDOW_MS = 90 * DAY_MS;
export const TRUSTED_MAX_REJECTIONS = 1; // fewer than 2
export const LOW_TRUST_REJECTIONS = 3;
export const CS_REPORTS_PER_DAY = 5;

/** Keeper outcomes that kept the content (the report was not upheld). */
export const REJECTED_RESOLUTIONS = new Set(["resolve", "dismiss", "ignore"]);
/** Keeper outcomes that acted on it. */
export const UPHELD_RESOLUTIONS = new Set(["remove_post", "remove_comment", "ban"]);

export interface ReporterFacts {
  accountAgeMs: number;
  suspended: boolean;
  isKeeper: boolean;
  /** Timestamps of this reporter's rejected child-safety reports. */
  rejectedAt: Date[];
}

export function recentRejections(rejectedAt: Date[], now = Date.now()): number {
  return rejectedAt.filter((d) => now - new Date(d).getTime() <= REJECTION_WINDOW_MS).length;
}

export function isTrustedReporter(f: ReporterFacts, now = Date.now()): boolean {
  if (f.isKeeper) return true;
  if (f.suspended) return false;
  return f.accountAgeMs >= TRUSTED_MIN_AGE_MS && recentRejections(f.rejectedAt, now) <= TRUSTED_MAX_REJECTIONS;
}

export function isLowTrust(rejectedAt: Date[], now = Date.now()): boolean {
  return recentRejections(rejectedAt, now) >= LOW_TRUST_REJECTIONS;
}

/**
 * Hide now? `reporterTrusted` is the person filing this report;
 * `reporterAgesMs` covers every distinct child-safety reporter of the take,
 * this one included.
 */
export function shouldHide(reporterTrusted: boolean, reporterAgesMs: number[]): boolean {
  if (reporterTrusted) return true;
  const aged = reporterAgesMs.filter((a) => a >= AGED_REPORTER_MS).length;
  return aged >= 2 || reporterAgesMs.length >= 3;
}

// ---- DB wrappers -----------------------------------------------------------

interface StandingDoc {
  _id: ObjectId;
  createdAt?: string;
  created_at?: string | Date;
  suspended?: boolean;
  cs_reports?: { upheld?: number; rejected_at?: Date[] };
}

function ageMs(u: StandingDoc | null, now = Date.now()): number {
  if (!u) return 0;
  const raw = u.createdAt ?? u.created_at;
  const t = raw ? new Date(raw).getTime() : u._id.getTimestamp().getTime();
  return Number.isNaN(t) ? 0 : now - t;
}

async function standingDocs(db: Db, ids: string[]): Promise<Map<string, StandingDoc>> {
  const oids = [...new Set(ids)].filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  const rows = oids.length
    ? await db
        .collection<StandingDoc>("users")
        .find({ _id: { $in: oids } })
        .project<StandingDoc>({ createdAt: 1, created_at: 1, suspended: 1, cs_reports: 1 })
        .toArray()
    : [];
  return new Map(rows.map((r) => [r._id.toString(), r]));
}

/** After filing a child-safety report on a take: hide it if the rules say so. */
export async function holdIfWarranted(db: Db, postId: ObjectId, reporterId: string): Promise<boolean> {
  const reporterIds = (
    await db
      .collection("reports")
      .find({ post_id: postId.toString(), reason: CHILD_SAFETY, reporter_id: { $type: "string" } })
      .project<{ reporter_id: string }>({ reporter_id: 1 })
      .toArray()
  ).map((r) => r.reporter_id);
  const docs = await standingDocs(db, [...reporterIds, reporterId]);
  const me = docs.get(reporterId) ?? null;
  const { isKeeperUser } = await import("@/lib/admin");
  const trusted = isTrustedReporter({
    accountAgeMs: ageMs(me),
    suspended: me?.suspended === true,
    isKeeper: await isKeeperUser(reporterId),
    rejectedAt: me?.cs_reports?.rejected_at ?? [],
  });
  const ages = [...new Set([...reporterIds, reporterId])].map((id) => ageMs(docs.get(id) ?? null));
  if (!shouldHide(trusted, ages)) return false;
  const { holdPost } = await import("./moderation.ts");
  await holdPost(db, postId);
  return true;
}

/**
 * Before a keeper's decision on a child-safety report takes effect: credit
 * the reporters. Upheld credits everyone who reported that target (a removal
 * deletes their reports with the take); rejected counts only against the
 * report being resolved.
 */
export async function recordOutcome(
  db: Db,
  report: { _id: ObjectId; post_id?: string; reason?: string; reporter_id?: string },
  action: string
): Promise<void> {
  if (report.reason !== CHILD_SAFETY) return;
  const users = db.collection("users");
  if (UPHELD_RESOLUTIONS.has(action)) {
    const ids = (
      await db
        .collection("reports")
        .find({ post_id: report.post_id, reason: CHILD_SAFETY, status: { $ne: "resolved" }, reporter_id: { $type: "string" } })
        .project<{ reporter_id: string }>({ reporter_id: 1 })
        .toArray()
    ).map((r) => r.reporter_id);
    const oids = [...new Set(ids)].filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
    if (oids.length) await users.updateMany({ _id: { $in: oids } }, { $inc: { "cs_reports.upheld": 1 } });
  } else if (REJECTED_RESOLUTIONS.has(action) && report.reporter_id && ObjectId.isValid(report.reporter_id)) {
    await users.updateOne(
      { _id: new ObjectId(report.reporter_id) },
      { $push: { "cs_reports.rejected_at": { $each: [new Date()], $slice: -20 } } } as never
    );
  }
}

/** What keepers see next to a child-safety report. */
export async function reporterStandings(
  db: Db,
  reporterIds: string[]
): Promise<Map<string, { upheld: number; rejected_90d: number; low_trust: boolean }>> {
  const docs = await standingDocs(db, reporterIds);
  const out = new Map<string, { upheld: number; rejected_90d: number; low_trust: boolean }>();
  for (const [id, d] of docs) {
    const rejectedAt = d.cs_reports?.rejected_at ?? [];
    out.set(id, { upheld: d.cs_reports?.upheld ?? 0, rejected_90d: recentRejections(rejectedAt), low_trust: isLowTrust(rejectedAt) });
  }
  return out;
}

/** Low-trust reporters, for the admin console. */
export async function lowTrustReporters(db: Db): Promise<{ handle: string; rejected_90d: number; upheld: number }[]> {
  const rows = await db
    .collection<StandingDoc & { handle?: string }>("users")
    .find({ [`cs_reports.rejected_at.${LOW_TRUST_REJECTIONS - 1}`]: { $exists: true } })
    .project<StandingDoc & { handle?: string }>({ handle: 1, cs_reports: 1 })
    .limit(200)
    .toArray();
  return rows
    .map((r) => ({
      handle: String(r.handle ?? ""),
      rejected_90d: recentRejections(r.cs_reports?.rejected_at ?? []),
      upheld: r.cs_reports?.upheld ?? 0,
    }))
    .filter((r) => r.rejected_90d >= LOW_TRUST_REJECTIONS);
}

/** Per-account cap on child-safety reports (the per-IP report limit still applies). */
export async function withinChildSafetyLimit(reporterId: string): Promise<{ ok: boolean; retryInSec: number }> {
  const { rateLimit } = await import("./rate-limit.ts");
  return rateLimit(`cs-report:${reporterId}`, CS_REPORTS_PER_DAY, DAY_MS);
}
