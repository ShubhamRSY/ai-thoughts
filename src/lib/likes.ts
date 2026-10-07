/** "Same 🫂" on feed cards. Stored as ❤️ so likes from before feeling reactions still count. */
export const LIKE_REACTION = "❤️" as const;
export const WORRIED_REACTION = "😟" as const;
export const AMAZED_REACTION = "🤩" as const;
/** The feeling reactions shown on every card, in display order. */
export const FEEL_REACTIONS = [
  { reaction: LIKE_REACTION, emoji: "🫂", label: "Same" },
  { reaction: WORRIED_REACTION, emoji: "😟", label: "Worried" },
  { reaction: AMAZED_REACTION, emoji: "🤩", label: "Amazed" },
] as const;
/** Repost/boost — a public signal, same toggle mechanics as Like. */
export const BOOST_REACTION = "🔁" as const;
/** Bookmark — private; see shouldNotifyOwner. */
export const BOOKMARK_REACTION = "🔖" as const;

/** Every reaction the product recognizes. Anything else is junk data. */
export const VALID_REACTIONS: readonly string[] = [
  LIKE_REACTION,
  BOOST_REACTION,
  BOOKMARK_REACTION,
  WORRIED_REACTION,
  AMAZED_REACTION,
];

export function isValidReaction(reaction: string): boolean {
  return VALID_REACTIONS.includes(reaction);
}

/** Bookmarking must stay private — the post owner never learns who saved it. */
export function shouldNotifyOwner(reaction: string): boolean {
  return reaction !== BOOKMARK_REACTION;
}

export type LikedByPerson = {
  handle: string;
  author: string;
};

function normHandle(h: string) {
  return h.trim().toLowerCase().replace(/^@/, "");
}

/** Build unique liked-by list (most recent first) from raw reaction rows. */
export function buildLikedBy(
  rows: { handle?: string; reaction?: string; created_at?: Date | string }[],
  nameByHandle: Map<string, string>,
  limit = 5
): LikedByPerson[] {
  const latest = new Map<string, { handle: string; at: number }>();
  for (const r of rows) {
    if (!r.handle) continue;
    const key = normHandle(r.handle);
    if (!key) continue;
    const at =
      r.created_at instanceof Date
        ? r.created_at.getTime()
        : r.created_at
          ? new Date(String(r.created_at)).getTime()
          : 0;
    const prev = latest.get(key);
    if (!prev || at >= prev.at) {
      latest.set(key, { handle: r.handle.startsWith("@") ? r.handle : `@${key}`, at });
    }
  }
  return [...latest.values()]
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map(({ handle }) => {
      const key = normHandle(handle);
      const author = nameByHandle.get(key) || handle.replace(/^@/, "");
      return { handle, author };
    });
}

export function formatLikedBy(
  people: LikedByPerson[],
  total: number,
  currentHandle?: string | null
): string | null {
  if (total <= 0) return null;

  const label = (p: LikedByPerson) => {
    if (currentHandle && normHandle(p.handle) === normHandle(currentHandle)) return "you";
    return p.author;
  };

  const named = people.map(label).filter(Boolean);
  if (named.length === 0) {
    return `${total} felt the same`;
  }
  if (total === 1) return `Felt the same: ${named[0]}`;
  if (total === 2) {
    if (named.length >= 2) return `Felt the same: ${named[0]} and ${named[1]}`;
    return `Felt the same: ${named[0]} and 1 other`;
  }
  if (named.length === 1) return `Felt the same: ${named[0]} and ${total - 1} others`;
  if (named.length >= 2) {
    const rest = total - 2;
    if (rest <= 0) return `Felt the same: ${named[0]} and ${named[1]}`;
    return `Felt the same: ${named[0]}, ${named[1]} and ${rest} other${rest === 1 ? "" : "s"}`;
  }
  return `${total} felt the same`;
}
