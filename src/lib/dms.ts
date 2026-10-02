import { ObjectId, type Db } from "mongodb";
import { isBlockedPair } from "./blocks.ts";
import { getPrivacy, handleVariants, type Privacy } from "./visibility.ts";

// Direct messages between two accounts. Conversations are keyed by user ids
// (like blocks), so they survive either side renaming.
// (No "@/" imports here — the policy below is unit-tested with plain node.)
//
// Instagram-style requests: if the recipient follows the sender, a message
// lands straight in their inbox; otherwise it's a request they can accept
// (replying accepts) or delete, and until then the sender can send only a few.

export const MAX_DM_LENGTH = 1000;
/** Messages a sender can leave before the recipient accepts the request. */
export const MAX_REQUEST_MESSAGES = 3;

export interface Conversation {
  _id: ObjectId;
  pair_key: string;
  members: [string, string];
  /** Members who see this in their main inbox (sender always; recipient once they accept). */
  accepted: string[];
  /** Members who deleted it from their list; a new message brings it back. */
  hidden_for: string[];
  read_at: Record<string, Date>;
  last_message_at: Date;
  last_preview: string;
  last_sender_id: string;
  created_at: Date;
}

export interface DmRow {
  _id: ObjectId;
  conversation_id: ObjectId;
  sender_id: string;
  body: string;
  created_at: Date;
}

export const pairKey = (a: string, b: string) => [a, b].sort().join(":");

export type DmPolicy = { allowed: false; reason: string } | { allowed: true; request: boolean };

/** Whether `sender` may start a conversation with the recipient, and whether it's a request. */
export function dmPolicy(opts: { blocked: boolean; recipientPrivacy: Privacy; recipientFollowsSender: boolean }): DmPolicy {
  if (opts.blocked) return { allowed: false, reason: "You can't message this account." };
  if (opts.recipientFollowsSender) return { allowed: true, request: false };
  if (opts.recipientPrivacy === "locked") {
    return { allowed: false, reason: "This account only gets messages from people it follows." };
  }
  return { allowed: true, request: true };
}

/** In a request the other side hasn't accepted, the sender gets a few messages, not a flood. */
export function requestLimitReached(otherAccepted: boolean, sentBySenderSoFar: number): boolean {
  return !otherAccepted && sentBySenderSoFar >= MAX_REQUEST_MESSAGES;
}

// ---- DB wrappers -----------------------------------------------------------

const conversations = (db: Db) => db.collection<Conversation>("conversations");
const dms = (db: Db) => db.collection<DmRow>("dms");

export interface DmUser {
  id: string;
  handle: string;
  displayName: string;
}

export async function usersById(db: Db, ids: string[]): Promise<Map<string, DmUser>> {
  const oids = [...new Set(ids)].filter((id) => ObjectId.isValid(id)).map((id) => new ObjectId(id));
  if (!oids.length) return new Map();
  const rows = await db
    .collection("users")
    .find({ _id: { $in: oids }, suspended: { $ne: true } }, { projection: { handle: 1, displayName: 1 } })
    .toArray();
  return new Map(
    rows
      .filter((r) => r.handle)
      .map((r) => {
        const id = r._id.toString();
        const handle = String(r.handle);
        return [id, { id, handle, displayName: String(r.displayName || handle) }];
      })
  );
}

export async function userByHandle(db: Db, handle: string): Promise<DmUser | null> {
  const row = await db
    .collection("users")
    .findOne({ handle: { $in: handleVariants(handle) }, suspended: { $ne: true } }, { projection: { handle: 1, displayName: 1 } });
  return row ? { id: row._id.toString(), handle: String(row.handle), displayName: String(row.displayName || row.handle) } : null;
}

async function follows(db: Db, follower: string, following: string): Promise<boolean> {
  const n = await db.collection("follows").countDocuments(
    { follower: { $in: handleVariants(follower) }, following: { $in: handleVariants(following) }, status: { $ne: "pending" } },
    { limit: 1 }
  );
  return n > 0;
}

export async function policyFor(db: Db, sender: DmUser, recipient: DmUser): Promise<DmPolicy> {
  const [blocked, recipientPrivacy, recipientFollowsSender] = await Promise.all([
    isBlockedPair(db, sender.handle, recipient.handle),
    getPrivacy(db, recipient.handle),
    follows(db, recipient.handle, sender.handle),
  ]);
  return dmPolicy({ blocked, recipientPrivacy, recipientFollowsSender });
}

/** The conversation between two accounts, created on first message. */
export async function openConversation(db: Db, senderId: string, recipientId: string, request: boolean): Promise<Conversation> {
  const now = new Date();
  const res = await conversations(db).findOneAndUpdate(
    { pair_key: pairKey(senderId, recipientId) },
    {
      $setOnInsert: {
        pair_key: pairKey(senderId, recipientId),
        members: [senderId, recipientId].sort() as [string, string],
        accepted: request ? [senderId] : [senderId, recipientId],
        hidden_for: [],
        read_at: {},
        last_message_at: now,
        last_preview: "",
        last_sender_id: senderId,
        created_at: now,
      },
    },
    { upsert: true, returnDocument: "after" }
  );
  return res!;
}

export async function getConversation(db: Db, id: string, memberId: string): Promise<Conversation | null> {
  if (!ObjectId.isValid(id)) return null;
  return conversations(db).findOne({ _id: new ObjectId(id), members: memberId });
}

export const otherMember = (c: Conversation, me: string) => (c.members[0] === me ? c.members[1] : c.members[0]);

export type SendResult = { ok: true; message: DmRow } | { ok: false; status: number; error: string };

/** Send into an existing conversation. The caller has already checked blocks and content. */
export async function sendDm(db: Db, c: Conversation, senderId: string, body: string): Promise<SendResult> {
  const other = otherMember(c, senderId);
  if (!c.accepted.includes(other)) {
    const sent = await dms(db).countDocuments({ conversation_id: c._id, sender_id: senderId }, { limit: MAX_REQUEST_MESSAGES });
    if (requestLimitReached(false, sent)) {
      return { ok: false, status: 429, error: "They haven't accepted your message request yet." };
    }
  }
  const message: DmRow = {
    _id: new ObjectId(),
    conversation_id: c._id,
    sender_id: senderId,
    body: body.slice(0, MAX_DM_LENGTH),
    created_at: new Date(),
  };
  await dms(db).insertOne(message);
  await conversations(db).updateOne(
    { _id: c._id },
    {
      $set: {
        last_message_at: message.created_at,
        last_preview: message.body.slice(0, 120),
        last_sender_id: senderId,
        [`read_at.${senderId}`]: message.created_at,
        // A new message brings a deleted conversation back for both sides.
        hidden_for: [],
      },
      // Replying to a request accepts it.
      $addToSet: { accepted: senderId },
    }
  );
  return { ok: true, message };
}

/** Latest messages (oldest first), or only those after `since` for polling. Marks the thread read. */
export async function readMessages(db: Db, c: Conversation, me: string, since: Date | null): Promise<DmRow[]> {
  const rows = await dms(db)
    .find({ conversation_id: c._id, ...(since ? { created_at: { $gt: since } } : {}) })
    .sort({ created_at: -1 })
    .limit(100)
    .toArray();
  if (rows.length || !since) {
    await conversations(db).updateOne({ _id: c._id }, { $set: { [`read_at.${me}`]: new Date() } });
  }
  return rows.reverse();
}

export async function acceptConversation(db: Db, c: Conversation, me: string): Promise<void> {
  await conversations(db).updateOne({ _id: c._id }, { $addToSet: { accepted: me } });
}

/** Delete for me (Instagram-style): hides it from my list; their copy stays. */
export async function hideConversation(db: Db, c: Conversation, me: string): Promise<void> {
  await conversations(db).updateOne({ _id: c._id }, { $addToSet: { hidden_for: me } });
}

export interface InboxItem {
  id: string;
  other: DmUser;
  last_preview: string;
  last_message_at: string;
  last_from_me: boolean;
  unread: boolean;
  /** Waiting for me to accept. */
  request: boolean;
}

export async function listInbox(db: Db, me: DmUser): Promise<InboxItem[]> {
  const rows = await conversations(db)
    .find({ members: me.id, hidden_for: { $ne: me.id } })
    .sort({ last_message_at: -1 })
    .limit(60)
    .toArray();
  const users = await usersById(db, rows.map((c) => otherMember(c, me.id)));
  const items: InboxItem[] = [];
  for (const c of rows) {
    const other = users.get(otherMember(c, me.id));
    if (!other) continue; // deleted or suspended account
    if (await isBlockedPair(db, me.handle, other.handle)) continue;
    const readAt = c.read_at?.[me.id];
    items.push({
      id: c._id.toString(),
      other,
      last_preview: c.last_preview,
      last_message_at: c.last_message_at.toISOString(),
      last_from_me: c.last_sender_id === me.id,
      unread: c.last_sender_id !== me.id && (!readAt || readAt < c.last_message_at),
      request: !c.accepted.includes(me.id),
    });
  }
  return items;
}

/** Account deletion: their conversations go, with every message in them. */
export async function deleteConversationsOf(db: Db, userId: string): Promise<void> {
  const ids = (await conversations(db).find({ members: userId }, { projection: { _id: 1 } }).toArray()).map((c) => c._id);
  if (!ids.length) return;
  await dms(db).deleteMany({ conversation_id: { $in: ids } });
  await conversations(db).deleteMany({ _id: { $in: ids } });
}

/** Account export: messages this user sent. */
export async function exportSentDms(db: Db, userId: string) {
  const rows = await dms(db).find({ sender_id: userId }).sort({ created_at: -1 }).limit(2000).toArray();
  return rows.map((m) => ({ conversation_id: m.conversation_id.toString(), body: m.body, created_at: m.created_at }));
}
