import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "crypto";

function getSecret(): string {
  const secret =
    process.env.EMAIL_ENCRYPTION_KEY?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim();
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return secret;
}

/** Constant-time string compare (UTF-8 bytes must match length). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, "utf8");
    const bb = Buffer.from(b, "utf8");
    if (ba.length !== bb.length) return false;
    return timingSafeEqual(ba, bb);
  } catch {
    return false;
  }
}

/** Lookup key for emails — irreversible. */
export function hashEmail(email: string): string {
  return createHmac("sha256", getSecret())
    .update(`email-hash-v1:${email.toLowerCase().trim()}`)
    .digest("hex");
}

function emailKey(): Buffer {
  return createHmac("sha256", getSecret()).update("email-enc-v1").digest();
}

/** Encrypt email at rest (AES-256-GCM). */
export function encryptEmail(email: string): string {
  const normalized = email.toLowerCase().trim();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", emailKey(), iv);
  const enc = Buffer.concat([cipher.update(normalized, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`;
}

/** Decrypt emailEnc, or pass through legacy plaintext emails containing @. */
export function decryptEmail(stored?: string | null): string | null {
  if (!stored) return null;
  if (!stored.startsWith("v1:")) {
    return stored.includes("@") ? stored.toLowerCase().trim() : null;
  }
  try {
    const [, ivB64, tagB64, dataB64] = stored.split(":");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const iv = Buffer.from(ivB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");
    const data = Buffer.from(dataB64, "base64url");
    const decipher = createDecipheriv("aes-256-gcm", emailKey(), iv);
    decipher.setAuthTag(tag);
    const out = Buffer.concat([decipher.update(data), decipher.final()]);
    return out.toString("utf8");
  } catch {
    return null;
  }
}

export function isEncryptedEmail(stored?: string | null): boolean {
  return Boolean(stored && stored.startsWith("v1:"));
}
