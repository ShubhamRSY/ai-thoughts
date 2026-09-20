// Local "soft daily nudge" preference (per device, in localStorage) shared by
// the settings screen that toggles it and DailyHabits, which fires the reminder
// (DailyHabits re-reads it on mount, so the two never need to be live together).

export const NUDGE_KEY = "aithoughts.daily-nudge.v1";
export interface NudgePrefs {
  enabled: boolean;
  lastShownDay: string;
  hour: number;
}

export function readNudgePrefs(): NudgePrefs {
  try {
    const raw = localStorage.getItem(NUDGE_KEY);
    if (raw) return { hour: 9, lastShownDay: "", enabled: false, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return { enabled: false, lastShownDay: "", hour: 9 };
}

export function writeNudgePrefs(p: NudgePrefs) {
  try {
    localStorage.setItem(NUDGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
