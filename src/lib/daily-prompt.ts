/**
 * Daily ritual prompts — one reason to open AI·Thoughts every day,
 * like a LinkedIn prompt or BeReal, but about how AI is changing us.
 */

const PROMPTS = [
  "What did AI change about your work today?",
  "Did AI help someone you care about — or hurt them?",
  "One thing AI got wrong for you recently?",
  "Would you trust AI with a hard personal decision today?",
  "Who in your life still refuses AI — and why?",
  "What are you quietly using AI for that you don’t admit?",
  "Did AI make you feel more capable or more replaceable today?",
  "A sentence you wrote with AI that still feels like you.",
  "What should AI never touch in your life?",
  "Who taught you something about AI this week?",
  "Are you using AI more, less, or differently than last month?",
  "What did a human do better than AI for you today?",
  "If AI vanished tomorrow, what would you miss first?",
  "A hopeful take about AI you actually believe.",
  "A worried take about AI you can’t shake.",
  "Did you correct AI today — or did it correct you?",
  "What language do you think in when you talk to AI?",
  "Who should hear your honest take about AI right now?",
  "What boundary with AI are you proud of keeping?",
  "What did AI make easier that maybe shouldn’t be easy?",
  "A kid, a parent, or a coworker — how is AI hitting them?",
  "Did you feel seen or erased by something AI generated?",
  "What’s one AI skill you wish schools taught?",
  "Would you want your next boss to be AI-assisted?",
  "What are you tired of hearing about AI?",
  "What do you wish more people said out loud about AI?",
  "Did AI save you time today — or steal your focus?",
  "A cultural tradition AI misunderstands in your world.",
  "How honest were you with AI today?",
  "What would make you open AI·Thoughts again tomorrow?",
];

/** Local calendar day key YYYY-MM-DD */
export function promptDayKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function shiftDayKey(dayKey: string, deltaDays: number): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + deltaDays);
  return promptDayKey(dt);
}

export function yesterdayKey(date = new Date()): string {
  return shiftDayKey(promptDayKey(date), -1);
}

export function todayKey(date = new Date()): string {
  return promptDayKey(date);
}

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getFullYear(), 0, 0);
  const now = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((now - start) / 864e5);
}

export function dailyPrompt(date = new Date()): string {
  return PROMPTS[dayOfYear(date) % PROMPTS.length]!;
}

/** Prompt text for a YYYY-MM-DD key (uses local calendar parse). */
export function dailyPromptForDay(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return dailyPrompt(new Date(y!, m! - 1, d!));
}

export { PROMPTS };
