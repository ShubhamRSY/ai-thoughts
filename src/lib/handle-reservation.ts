import type { Db } from "mongodb";

// A handle someone renamed away from, or whose account was deleted, is held
// for RESERVE_DAYS so nobody else can pick it up straight away and pass as that
// person (and so any leftover reference to the old name can't be inherited).
// Only the account that gave it up may take it back during the hold; a deleted
// account is gone, so its handle simply waits out the hold.
// (No "@/" imports here — this file is unit-tested with plain node.)

export const RESERVE_DAYS = 90;
const DAY_MS = 864e5;

export interface HandleReservation {
  handle_norm: string;
  previous_user_id: string;
  reason: "renamed" | "deleted";
  reserved_at: Date;
  reserved_until: Date;
}

export const normHandle = (h: string) => h.trim().toLowerCase().replace(/^@/, "");

export function reservedUntil(from: Date): Date {
  return new Date(from.getTime() + RESERVE_DAYS * DAY_MS);
}

/** Whether `row` stops `userId` (null = a brand-new account) from taking the handle. */
export function reservationBlocks(
  row: Pick<HandleReservation, "previous_user_id" | "reserved_until"> | null | undefined,
  userId: string | null,
  now = new Date()
): boolean {
  if (!row) return false;
  if (row.reserved_until.getTime() <= now.getTime()) return false; // TTL sweep runs ~once a minute
  return row.previous_user_id !== userId;
}

export async function isHandleReserved(db: Db, handle: string, userId: string | null): Promise<boolean> {
  const row = await db
    .collection<HandleReservation>("reserved_handles")
    .findOne({ handle_norm: normHandle(handle) });
  return reservationBlocks(row, userId);
}

export async function reserveHandle(
  db: Db,
  handle: string,
  previousUserId: string,
  reason: HandleReservation["reason"]
): Promise<void> {
  const handle_norm = normHandle(handle);
  if (!handle_norm) return;
  const now = new Date();
  await db.collection<HandleReservation>("reserved_handles").updateOne(
    { handle_norm },
    { $set: { handle_norm, previous_user_id: previousUserId, reason, reserved_at: now, reserved_until: reservedUntil(now) } },
    { upsert: true }
  );
}

/** The previous owner took their handle back — the hold has done its job. */
export async function releaseReservation(db: Db, handle: string, userId: string): Promise<void> {
  await db
    .collection("reserved_handles")
    .deleteOne({ handle_norm: normHandle(handle), previous_user_id: userId });
}
