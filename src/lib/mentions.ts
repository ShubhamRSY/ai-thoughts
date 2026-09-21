/** Extract @handles from comment text (without leading @). */
export function extractMentions(text: string): string[] {
  const found = new Set<string>();
  // A mention must start its own token — the negative lookbehind keeps email
  // addresses like user@example.com and mid-word "@" from becoming mentions.
  const re = /(?<![\w])@([a-zA-Z0-9_.-]{1,40})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const h = m[1].toLowerCase();
    if (h) found.add(h);
  }
  return [...found];
}

export function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

/** Active @query at caret — e.g. "@may" → { query: "may", start, end }. */
export function mentionQueryAt(
  text: string,
  caret: number
): { query: string; start: number; end: number } | null {
  const before = text.slice(0, caret);
  const match = before.match(/(?:^|\W)(@[a-zA-Z0-9_.-]{0,40})$/);
  if (!match) return null;
  const at = match.index! + match[0].indexOf("@");
  return { query: match[1].slice(1).toLowerCase(), start: at, end: caret };
}

export type MentionPerson = {
  handle: string;
  author: string;
};

/** Split body into plain + @mention parts for rendering. */
export function splitMentionParts(
  body: string
): { type: "text" | "mention"; value: string }[] {
  const parts: { type: "text" | "mention"; value: string }[] = [];
  const re = /(?<![\w])@([a-zA-Z0-9_.-]{1,40})/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    if (m.index > last) {
      parts.push({ type: "text", value: body.slice(last, m.index) });
    }
    parts.push({ type: "mention", value: m[0] });
    last = m.index + m[0].length;
  }
  if (last < body.length) parts.push({ type: "text", value: body.slice(last) });
  return parts;
}
