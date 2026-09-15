export type MediaType = "audio" | "video" | "text";

/** Result of attempting to publish a take onto the pulse. */
export type PublishResult =
  | { ok: true }
  | { ok: false; reason: "cooldown"; retryInSec: number }
  | { ok: false; reason: "empty" }
  | { ok: false; reason: "too_long"; max: number }
  | { ok: false; reason: "auth" }
  | { ok: false; reason: "blocked"; message: string }
  | { ok: false; reason: "failed"; message?: string };

export type VerificationStatus = "verified" | "simulated";

/** A feeling people have about AI — the emotional heart of each take. */
export type FeelingId =
  | "using-it"
  | "love-it"
  | "hurts"
  | "blown-away"
  | "worried"
  | "need-support"
  | "confused";

export interface Feeling {
  id: FeelingId;
  emoji: string;
  label: string;
  /** Short caption used on the tiny badges. */
  short: string;
  /** Soft pill color classes for the badge. */
  chip: string;
  /** Emotional tone word for copy (“warm”, “tender”…). */
  tone?: string;
}

export type Reaction = "❤️" | "🔥" | "😂" | "🤔" | "💯" | "🚀" | "😴" | "👏" | "🙌";

export interface ReactionCount {
  type: Reaction;
  count: number;
}

/** People who reacted / liked a take (most recent first). */
export interface LikedByPerson {
  handle: string;
  author: string;
}

export interface Integrity {
  /** SHA-256 hex of the original media/content, captured at upload. */
  hash: string;
  /** True when the hash was digitally signed by the capture device/our backend. */
  verified: boolean;
  /** Human label like "Unmodified" or "Capture incomplete". */
  statusLabel: string;
}

/** One line of a spoken transcript, tied to a media timestamp (seconds). */
export interface TranscriptSegment {
  time: number;
  text: string;
}

export interface LanguageOption {
  code: string;
  label: string;
  flag?: string;
}

export interface Thought {
  id: string;
  author: string;
  handle: string;
  content: string;
  mediaType: MediaType;
  /** How the author feels about AI right now (the heart of every take). */
  feeling?: FeelingId;
  mediaUrl?: string;
  mediaDuration?: string;
  /** HLS manifest URL (.m3u8) once a take has been transcoded for streaming. */
  streamUrl?: string;
  streamReady?: boolean;
  tags: string[];
  timestamp: string;
  reactions: ReactionCount[];
  /** Unique people who liked/reacted (preview for “Liked by …”). */
  likedBy?: LikedByPerson[];
  /** How many unique people liked/reacted. */
  likeCount?: number;
  /** Whether the signed-in user already liked this take. */
  likedByMe?: boolean;
  /** Prefetched reply/comment count. */
  replyCount?: number;
  /** ISO when the author account was created (for “New” badge). */
  authorJoinedAt?: string;
  /** Human relative time label like "2m" */
  timeLabel: string;
  integrity: Integrity;
  /** Spoken transcript for audio/video takes (time-coded). */
  transcript?: TranscriptSegment[];
  /** BCP-47 language code, e.g. "en", "es", "hi". */
  language?: string;
  /** Human label, e.g. "English", "Español". */
  languageLabel?: string;
  /** YYYY-MM-DD when this take answers that day's ritual prompt. */
  promptDay?: string;
  /** Snapshot of the prompt text at share time. */
  promptText?: string;
}
