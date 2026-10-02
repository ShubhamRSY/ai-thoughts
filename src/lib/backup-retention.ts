/**
 * Retention for blob-stored database archives.
 *
 * Backups are only useful while they are still recoverable, and an unbounded
 * pile in Blob is a bill and a liability — the archives contain real handles and
 * post text. Keep a rolling window, always preserving at least the most recent
 * one so a bad run can never delete the last good copy.
 */
export const DEFAULT_KEEP = 14;

export type BackupEntry = { pathname: string; uploadedAt?: Date | string };

/** "backups/<db>-2026-09-30T04-05-06-789Z.json.gz" → epoch ms (0 if absent). */
export function pathnameTime(pathname: string): number {
  const m = /(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z/.exec(pathname);
  return (m && Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`)) || 0;
}

/**
 * Decide which archived backups to delete. Pure and side-effect free so the
 * policy can be reasoned about (and tested) without touching Blob.
 */
export function selectExpiredBackups(
  entries: BackupEntry[],
  keep: number = DEFAULT_KEEP,
  prefix = "backups/"
): string[] {
  const mine = entries
    .filter((e) => e.pathname?.startsWith(prefix))
    // uploadedAt is server-assigned; pathname embeds the ISO timestamp, so it
    // is the reliable sort key when the metadata is missing.
    .sort((a, b) => {
      const at = (e: BackupEntry) =>
        (e.uploadedAt ? new Date(e.uploadedAt).getTime() : 0) ||
        pathnameTime(e.pathname);
      return at(b) - at(a);
    });

  if (mine.length <= keep) return [];
  // Never expire the newest — a retention bug must not be able to leave zero backups.
  return mine.slice(Math.max(keep, 1)).map((e) => e.pathname);
}
