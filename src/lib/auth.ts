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
} from "@/lib/anti-abuse";

export const SESSION_COOKIE = "aithoughts.session";
/** Stay signed in across app closes — 90 days, refreshed on each visit. */
const SESSION_MAX_AGE = 60 * 60 * 24 * 90;

export interface SessionUser {
  id: string;
  email: string;
  handle: string;
  displayName: string;
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
}

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
    return JSON.parse(atob(encoded));
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

export async function createSession(user: {
  _id?: ObjectId | string;
  id?: string;
  handle: string;
  displayName: string;
}): Promise<string> {
  // Do not put email in the cookie — load from DB when needed.
  const id =
    typeof user.id === "string"
      ? user.id
      : user._id
        ? String(user._id)
        : "";
  const payload = {
    id,
    handle: user.handle,
    displayName: user.displayName,
    exp: Date.now() + SESSION_MAX_AGE * 1000,
  };

  const encoded = encodeSessionPayload(payload);
  const signature = await hmacSign(encoded, getSecret());
  return `${encoded}.${signature}`;
}

export async function validateSession(token: string): Promise<SessionUser | null> {
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
    };
    if (!payload?.exp || payload.exp < Date.now()) return null;
    if (!payload.id || !payload.handle) return null;

    const { db } = await connectToDatabase();
    let email = "";
    try {
      const user = await db.collection<UserRecord>("users").findOne({
        _id: new ObjectId(payload.id),
      });
      email =
        decryptEmail(user?.emailEnc) ||
        decryptEmail(user?.email) ||
        payload.email ||
        "";
    } catch {
      email = payload.email || "";
    }

    return {
      id: payload.id,
      email,
      handle: payload.handle,
      displayName: payload.displayName,
    };
  } catch {
    return null;
  }
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
  displayName: string
): Promise<UserRecord> {
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

  if (user) {
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          lastLoginAt: new Date().toISOString(),
          emailHash,
          emailEnc,
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        },
        $unset: { email: "" },
      }
    );
    user.lastLoginAt = new Date().toISOString();
    user.emailHash = emailHash;
    user.emailEnc = emailEnc;
    delete user.email;
    if (displayName.trim()) user.displayName = displayName.trim();
  } else {
    const local = normalizedEmail.split("@")[0] || "user";
    let handle = allocateSafeHandle(local);
    // Extremely unlikely collision — retry a few times
    for (let i = 0; i < 5; i++) {
      const taken = await users.findOne({
        handle: { $in: [handle, handle.toLowerCase()] },
      });
      if (!taken) break;
      handle = allocateSafeHandle(`${local}${i}`);
    }
    const newUser: UserRecord = {
      emailHash,
      emailEnc,
      handle,
      displayName: displayName.trim() || local.replace(/[^a-z0-9]/gi, "").slice(0, 12) || "friend",
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    const result = await users.insertOne(newUser);
    newUser._id = result.insertedId;
    user = newUser;
  }

  return user;
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

  const blobUrls = [
    ...posts.flatMap((p) => mediaUrlsFromPost(p)),
    ...profiles.flatMap((p) => mediaUrlsFromPost(p)),
  ];
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
