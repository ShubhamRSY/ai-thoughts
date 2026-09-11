import { cookies } from "next/headers";
import { connectToDatabase } from "@/lib/mongodb";
import { ObjectId } from "mongodb";

export const SESSION_COOKIE = "aithoughts.session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export interface SessionUser {
  id: string;
  email: string;
  handle: string;
  displayName: string;
}

export interface UserRecord {
  _id?: ObjectId;
  email: string;
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

/** Unicode-safe, cookie-safe base64url. */
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
    // Legacy sessions created with btoa(JSON.stringify(...))
    return JSON.parse(atob(encoded));
  }
}

export function sessionCookieOptions(maxAge: number = SESSION_MAX_AGE) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

export async function createSession(user: UserRecord): Promise<string> {
  const payload = {
    id: user._id?.toString() ?? "",
    email: user.email,
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
    if (signature !== expectedSig) return null;

    const payload = decodeSessionPayload(encoded) as {
      id: string;
      email: string;
      handle: string;
      displayName: string;
      exp: number;
    };
    if (!payload?.exp || payload.exp < Date.now()) return null;

    return {
      id: payload.id,
      email: payload.email,
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
  const { db } = await connectToDatabase();
  const keeper = await db.collection("keepers").findOne({ handle });
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
  const { db } = await connectToDatabase();
  const users = db.collection<UserRecord>("users");

  const normalizedEmail = email.toLowerCase().trim();

  let user: UserRecord | null = await users.findOne({ email: normalizedEmail });

  if (user) {
    await users.updateOne(
      { _id: user._id },
      {
        $set: {
          lastLoginAt: new Date().toISOString(),
          ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        },
      }
    );
    user.lastLoginAt = new Date().toISOString();
    if (displayName.trim()) user.displayName = displayName.trim();
  } else {
    const base = normalizedEmail.split("@")[0].replace(/[^a-z0-9]/gi, "").slice(0, 12) || "user";
    const handle = `@${base}${Math.floor(Math.random() * 9000 + 1000)}`;
    const newUser: UserRecord = {
      email: normalizedEmail,
      handle,
      displayName: displayName.trim() || base,
      createdAt: new Date().toISOString(),
      lastLoginAt: new Date().toISOString(),
    };
    const result = await users.insertOne(newUser);
    newUser._id = result.insertedId;
    user = newUser;
  }

  return user;
}
