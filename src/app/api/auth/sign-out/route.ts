import { NextResponse } from "next/server";
import { getSession, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { revokeSession } from "@/lib/sessions";

export async function POST() {
  // Drop this device's server-side session too, so a copied cookie is dead.
  const session = await getSession();
  if (session?.sid) {
    const { db } = await connectToDatabase();
    await revokeSession(db, session.id, session.sid);
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(0), maxAge: 0 });
  return res;
}
