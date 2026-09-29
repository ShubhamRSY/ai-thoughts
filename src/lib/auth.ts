import { cookies } from "next/headers";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";
import {
  decryptEmail,
  encryptEmail,
  hashEmail,
  timingSafeEqualStr,
} from "@/lib/secure";
import {
  allocateSafeHandle,
  checkDisposableEmail,
  checkDisplayNameAllowed,
  checkHandleAllowed,
} from "@/lib/anti-abuse";

export const SESSION_COOKIE = "aithoughts.session";
/** Stay signed in across app closes — 90 days, refreshed on each visit. */
const SESSION_MAX_AGE = 60 * 60 * 24 * 90;

export interface SessionUser {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  /** Whether the account holds the verified checkmark. Loaded fresh from DB each session. */
  verified?: boolean;
  /** Server-side session id. Missing on legacy cookies until /api/auth/me upgrades them. */
  sid?: string;
}

export interface UserRecord {
  _id?: ObjectId;
  /** @deprecated plaintext — migrated to emailEnc on login */
  email?: string;
  emailHash?: string;
  emailEnc?: string;
  handle: string;
  displayName: string;
  createdAt: string;
  lastLoginAt: string;
  /** Blue checkmark — granted by admins via /api/admin/controls. */
  verified?: boolean;
  /** Suspended by a keeper: sign-in, posts, and search are blocked until lifted. */
  suspended?: boolean;
  /** "Sign out everywhere": tokens issued before this (ms) are rejected. */
  sessions_revoked_before?: number;
  /** When this person last confirmed they are MIN_AGE or older (required at every sign-in). */
  ageConfirmedAt?: string;
}

/** AiTo is adults-only. Checked server-side at sign-in (api/auth/verify). */
export const MIN_AGE = 18;

function getSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

async function hmacSign(data: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function encodeSessionPayload(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSessionPayload(encoded: string): unknown {
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const withPad = padded + "=".repeat((4 - (padded.length % 4)) % 4);
    const binary = atob(withPad);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    // Never throw from here — callers (e.g. verifySessionToken) treat a
    // malformed payload as "no session". The old `atob` fallback always threw
    // on url-safe input anyway.
    return null;
  }
}

export function sessionCookieOptions(maxAge: number = SESSION_MAX_AGE) {
  const secure =
    process.env.NODE_ENV === "production" ||
    process.env.VERCEL === "1" ||
    process.env.VERCEL_ENV === "production";
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    maxAge,
    path: "/",
    // Explicit expiry helps some mobile WebViews keep the cookie after app kill.
    expires: new Date(Date.now() + Math.max(maxAge, 0) * 1000),
  };
}

/**
 * Issue a session token. Without `opts.sid` this starts a NEW session (a row in
 * `sessions`, so it shows up in the user's device list); pass the current `sid`
 * when merely re-issuing a cookie (sliding expiry, renamed profile).
 */
export async function createSession(
  user: {
    _id?: ObjectId | string;
    id?: string;
    handle: string;
    displayName: string;
  },
  opts: { sid?: string; userAgent?: string | null } = {}
): Promise<string> {
  // Do not put email in the cookie — load from DB when needed.
  const id =
    typeof user.id === "string"
      ? user.id
      : user._id
        ? String(user._id)
        : "";
  const now = Date.now();
  let sid = opts.sid;
  if (!sid) {
    sid = crypto.randomUUID();
    const { db } = await connectToDatabase();
    await db.collection("sessions").insertOne({
      sid,
      user_id: id,
      handle: user.handle,
      user_agent: (opts.userAgent ?? "").slice(0, 300),
      created_at: new Date(now),
      last_seen_at: new Date(now),
      // TTL index (see ensureCoreIndexes) drops the row when the cookie would expire anyway.
      expires_at: new Date(now + SESSION_MAX_AGE * 1000),
    });
  }
  const payload = {
    id,
    handle: user.handle,
    displayName: user.displayName,
    exp: now + SESSION_MAX_AGE * 1000,
    iat: now,
    sid,
  };

  const encoded = encodeSessionPayload(payload);
  const signature = await hmacSign(encoded, getSecret());
  return `${encoded}.${signature}`;
}

/**
 * Signature + expiry check only — no DB round trip. Cheap enough for the
 * proxy to run on every page request; use validateSession when you need the
 * user.
 */
export async function verifySessionToken(token: string) {
  try {
    const [encoded, signature] = token.split(".");
    if (!encoded || !signature) return null;

    const expectedSig = await hmacSign(encoded, getSecret());
    if (!timingSafeEqualStr(signature, expectedSig)) return null;

    const payload = decodeSessionPayload(encoded) as {
      id: string;
      email?: string;
      handle: string;
      displayName: string;
      exp: number;
      /** Issued-at (ms). Legacy tokens lack it; see issuedAt(). */
      iat?: number;
      sid?: string;
    };
    if (!payload?.exp || payload.exp < Date.now()) return null;
    if (!payload.id || !payload.handle) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Legacy tokens have no `iat`, but they always lived exactly SESSION_MAX_AGE. */
function issuedAt(payload: { iat?: number; exp: number }): number {
  return payload.iat ?? payload.exp - SESSION_MAX_AGE * 1000;
}

/**
 * null = the token is invalid or revoked. Throws when the store can't be
 * reached: "couldn't check" must not read as "signed out", or a DB blip
 * signs everyone out (proxy.ts cleared the cookie) and skips revocation.
 */
export async function validateSession(token: string): Promise<SessionUser | null> {
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const { db } = await connectToDatabase();
  const user = await db.collection<UserRecord>("users").findOne({
    _id: new ObjectId(payload.id),
  });
  const email =
    decryptEmail(user?.emailEnc) ||
    decryptEmail(user?.email) ||
    payload.email ||
    "";
  const revokedBefore = user?.sessions_revoked_before ?? 0;
  const verified = Boolean(user?.verified);

  // "Sign out everywhere" — also the only way to end legacy (sid-less) tokens.
  if (issuedAt(payload) < revokedBefore) return null;

  // A session that was revoked (or expired out of the store) is gone for good.
  if (payload.sid) {
    const row = await db.collection("sessions").findOne({ sid: payload.sid });
    if (!row) return null;
    const last = row.last_seen_at instanceof Date ? row.last_seen_at.getTime() : 0;
    if (Date.now() - last > 10 * 60_000) {
      void db
        .collection("sessions")
        .updateOne({ sid: payload.sid }, { $set: { last_seen_at: new Date() } })
        .catch(() => {}); // best-effort touch; an outage must not become an unhandled rejection
    }
  }

  return {
    id: payload.id,
    email,
    handle: payload.handle,
    displayName: payload.displayName,
    verified,
    sid: payload.sid,
  };
}

export async function getSession(): Promise<SessionUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return validateSession(token);
}

export async function isKeeperHandle(handle: string): Promise<boolean> {
  if (!handle) return false;
  // Global admins inherit keeper moderation powers.
  const { isAdminHandle } = await import("@/lib/admin");
  if (await isAdminHandle(handle)) return true;

  const { db } = await connectToDatabase();
  const n = handle.trim().toLowerCase().replace(/^@/, "");
  const keeper = await db.collection("keepers").findOne({
    handle: { $in: [handle, `@${n}`, n, `@${n}`.toLowerCase()] },
  });
  return Boolean(keeper);
}

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, sessionCookieOptions());
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
}

export async function findOrCreateUser(
  email: string,
  displayName: string,
  preferredHandle?: string
): Promise<{ user: UserRecord; createdNew: boolean }> {
  const disposable = checkDisposableEmail(email);
  if (!disposable.ok) {
    throw new Error(disposable.reason);
  }
  const nameCheck = checkDisplayNameAllowed(displayName || "");
  if (!nameCheck.ok) {
    throw new Error(nameCheck.reason);
  }

  const { db } = await connectToDatabase();
  const users = db.collection<UserRecord>("users");

  const normalizedEmail = email.toLowerCase().trim();
  const emailHash = hashEmail(normalizedEmail);
  const emailEnc = encryptEmail(normalizedEmail);

  let user: UserRecord | null =
    (await users.findOne({ emailHash })) ||
    (await users.findOne({ email: normalizedEmail }));
  let createdNew = false;

  if (user) {
    if (user.suspended === true) {
      throw new Error(
        "This account has been suspended by our moderation team. Contact support if you believe this is a mistake."
      );
    }
    // A real, chosen display name always wins. When none is given, drop a
    // stored name that is just the person's email (legacy fallback) so an
    // address never shows up on comments or feelings instead of a name.
    let nextName: string | undefined;
    if (displayName.trim()) {
      nextName = displayName.trim();
    } else {
      const local = normalizedEmail.split("@")[0].toLowerCase();
      const storedName = (user.displayName ?? "").trim();
      const emailDerived =
        storedName.toLowerCase() === local || storedName.toLowerCase() === normalizedEmail;
      if (emailDerived) nextName = "Voice";
    }
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          lastLoginAt: new Date().toISOString(),
          ageConfirmedAt: new Date().toISOString(),
          emailHash,
          emailEnc,
          ...(nextName ? { displayName: nextName } : {}),
        },
        $unset: { email: "" },
      }
    );
    user.lastLoginAt = new Date().toISOString();
    user.emailHash = emailHash;
    user.emailEnc = emailEnc;
    delete user.email;
    if (nextName) user.displayName = nextName;
  } else {
    // Prefer the username the person chose at sign-in over an email-derived
    // handle so their address is never guessable.
    let handle = "";
    if (preferredHandle && typeof preferredHandle === "string" && preferredHandle.trim()) {
      const norm = preferredHandle.trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, "");
      if (
        norm.length >= 3 &&
        norm.length <= 30 &&
        /^[a-z0-9_]+$/.test(norm) &&
        checkHandleAllowed(`@${norm}`).ok
      ) {
        handle = `@${norm}`;
      }
    }
    if (!handle) handle = allocateSafeHandle();
    // Extremely unlikely collision — retry a few times
    for (let i = 0; i < 5; i++) {
      const taken = await users.findOne({
        handle: { $in: [handle, handle.toLowerCase()] },
      });
      if (!taken) break;
      handle = allocateSafeHandle();
    }
    const newUser: UserRecord = {
      emailHash,
      emailEnc,
      handle,
      // Never surface the email prefix as a display name.
      displayName:
        displayName.trim() || (preferredHandle ? preferredHandle.replace(/^@/, "") : "Voice"),
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
      ageConfirmedAt: new Date().toISOString(),
    };
    // The unique indexes on handle/emailHash are the real guard; the findOne
    // checks above only make the common case friendly.
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await users.insertOne(newUser);
        newUser._id = result.insertedId;
        break;
      } catch (e) {
        const dupKey = (e as { code?: number; keyPattern?: Record<string, unknown> });
        if (dupKey.code !== 11000 || attempt >= 4) throw e;
        if (dupKey.keyPattern?.emailHash) {
          // Same email verified twice at once — the other request created it.
          return findOrCreateUser(email, displayName, preferredHandle);
        }
        const chosen = preferredHandle?.trim().toLowerCase().replace(/^@/, "").replace(/\s+/g, "");
        if (chosen && newUser.handle === `@${chosen}`) {
          throw new Error(`${newUser.handle} was just taken — try another username.`);
        }
        newUser.handle = allocateSafeHandle();
      }
    }
    user = newUser;
    createdNew = true;
  }

  return { user, createdNew };
}

/** Wipe account + related data for the signed-in user. */
export async function deleteUserAccount(session: SessionUser): Promise<void> {
  const { db } = await connectToDatabase();
  const { deleteBlobUrls, mediaUrlsFromPost } = await import("@/lib/privacy");
  const handleVariants = Array.from(
    new Set([
      session.handle,
      session.handle.toLowerCase(),
      `@${session.handle.replace(/^@/, "")}`,
      session.handle.replace(/^@/, ""),
    ])
  );

  const posts = await db
    .collection("posts")
    .find({
      $or: [{ user_id: session.id }, { handle: { $in: handleVariants } }],
    })
    .project({ _id: 1, media_url: 1, stream_url: 1 })
    .toArray();
  const postIds = posts.map((p) => p._id.toString());

  const profiles = await db
    .collection("profiles")
    .find({
      $or: [{ userId: session.id }, { handle: { $in: handleVariants } }],
    })
    .project({ avatar_url: 1, avatarUrl: 1 })
    .toArray();

  // Deleting your account must not destroy child-safety evidence.
  const { preserveChildSafetyEvidence } = await import("@/lib/moderation");
  const keepFiles = await preserveChildSafetyEvidence(db, postIds, `account-deletion:${session.handle}`);
  const blobUrls = [
    ...posts.flatMap((p) => mediaUrlsFromPost(p)),
    ...profiles.flatMap((p) => mediaUrlsFromPost(p)),
  ].filter((u) => !keepFiles.has(u));
  await deleteBlobUrls(blobUrls);

  if (postIds.length) {
    await db.collection("messages").deleteMany({ post_id: { $in: postIds } });
    await db.collection("reactions").deleteMany({ post_id: { $in: postIds } });
    await db.collection("reports").deleteMany({ post_id: { $in: postIds } });
    await db.collection("notifications").deleteMany({ post_id: { $in: postIds } });
    await db.collection("posts").deleteMany({
      _id: { $in: posts.map((p) => p._id) },
    });
  }

  await db.collection("messages").deleteMany({ handle: { $in: handleVariants } });
  await db.collection("reactions").deleteMany({ handle: { $in: handleVariants } });
  await db.collection("reports").deleteMany({
    $or: [
      { reporter_handle: { $in: handleVariants } },
      { reported_handle: { $in: handleVariants } },
    ],
  });
  await db.collection("notifications").deleteMany({
    $or: [
      { recipient_handle: { $in: handleVariants } },
      { actor_handle: { $in: handleVariants } },
    ],
  });
  await db.collection("follows").deleteMany({
    $or: [
      { follower: { $in: handleVariants } },
      { following: { $in: handleVariants } },
    ],
  });
  // Mood check-ins, block/mute lists and view history are personal data too —
  // "delete my account" must leave none of it behind (GDPR/CCPA erasure).
  await db.collection("moods").deleteMany({
    handle_norm: session.handle.trim().toLowerCase().replace(/^@/, ""),
  });
  await db.collection("blocks").deleteMany({
    $or: [{ blocker: { $in: handleVariants } }, { blocked: { $in: handleVariants } }],
  });
  await db.collection("mutes").deleteMany({
    $or: [{ muter: { $in: handleVariants } }, { muted: { $in: handleVariants } }],
  });
  await db.collection("post_views").deleteMany({
    viewer_key: { $in: handleVariants.map((h) => `user:${h}`) },
  });
  await db.collection("sessions").deleteMany({ user_id: session.id });
  await db.collection("user_prefs").deleteMany({ handle: { $in: handleVariants } });
  await db.collection("push_subscriptions").deleteMany({ handle: { $in: handleVariants } });
  await db.collection("profiles").deleteMany({
    $or: [{ userId: session.id }, { handle: { $in: handleVariants } }],
  });

  const emailHash = session.email ? hashEmail(session.email) : null;
  await db.collection("auth_codes").deleteMany({
    $or: [
      ...(emailHash ? [{ emailHash }] : []),
      ...(session.email ? [{ email: session.email.toLowerCase() }] : []),
    ],
  });

  try {
    await db.collection("users").deleteOne({ _id: new ObjectId(session.id) });
  } catch {
    await db.collection("users").deleteMany({ handle: { $in: handleVariants } });
  }
}
