import { connectToDatabase } from "@/lib/mongodb";
import { hashEmail, timingSafeEqualStr } from "@/lib/secure";

const OTP_TTL_MS = 10 * 60_000;
const MAX_ATTEMPTS = 5;

export interface AuthCodeRecord {
  /** @deprecated plaintext — prefer emailHash */
  email?: string;
  emailHash: string;
  codeHash: string;
  displayName: string;
  /** Chosen username (handle) captured at sign-in. Only used once, for brand-new accounts. */
  handle?: string;
  attempts: number;
  createdAt: Date;
  expiresAt: Date;
}

function getSecret(): string {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

async function hmacHex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function generateOtpCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return n.toString().padStart(6, "0");
}

export async function hashOtp(email: string, code: string): Promise<string> {
  return hmacHex(`${email.toLowerCase().trim()}:${code}`);
}

export async function storeOtp(
  email: string,
  code: string,
  displayName: string,
  handle?: string
): Promise<void> {
  const { db } = await connectToDatabase();
  const normalized = email.toLowerCase().trim();
  const emailHash = hashEmail(normalized);
  const codeHash = await hashOtp(normalized, code);
  const now = new Date();

  await db.collection("auth_codes").createIndex(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
  );

  await db.collection("auth_codes").deleteMany({
    $or: [{ emailHash }, { email: normalized }],
  });
  await db.collection("auth_codes").insertOne({
    emailHash,
    codeHash,
    displayName,
    ...(handle ? { handle } : {}),
    attempts: 0,
    createdAt: now,
    expiresAt: new Date(now.getTime() + OTP_TTL_MS),
  } satisfies AuthCodeRecord);
}

export type VerifyOtpResult =
  | { ok: true; displayName: string; handle?: string }
  | { ok: false; error: string };

export async function verifyAndConsumeOtp(
  email: string,
  code: string
): Promise<VerifyOtpResult> {
  const { db } = await connectToDatabase();
  const normalized = email.toLowerCase().trim();
  const emailHash = hashEmail(normalized);
  const codes = db.collection<AuthCodeRecord>("auth_codes");

  const record =
    (await codes.findOne({ emailHash })) ||
    (await codes.findOne({ email: normalized }));
  if (!record) {
    return { ok: false, error: "No code found — request a new one" };
  }

  const matchFilter = record.emailHash
    ? { emailHash: record.emailHash }
    : { email: normalized };

  if (record.expiresAt.getTime() < Date.now()) {
    await codes.deleteMany(matchFilter);
    return { ok: false, error: "Code expired — request a new one" };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await codes.deleteMany(matchFilter);
    return { ok: false, error: "Too many attempts — request a new code" };
  }

  const expected = await hashOtp(normalized, code.trim());
  if (!timingSafeEqualStr(expected, record.codeHash)) {
    await codes.updateOne(matchFilter, { $inc: { attempts: 1 } });
    const left = MAX_ATTEMPTS - record.attempts - 1;
    return {
      ok: false,
      error: left > 0 ? `Incorrect code (${left} tries left)` : "Too many attempts — request a new code",
    };
  }

  await codes.deleteMany(matchFilter);
  return {
    ok: true,
    displayName: record.displayName,
    ...(record.handle ? { handle: record.handle } : {}),
  };
}
