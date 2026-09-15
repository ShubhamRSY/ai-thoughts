import { NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import {
  createSession,
  getSession,
  SESSION_COOKIE,
  sessionCookieOptions,
  type UserRecord,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { decryptEmail } from "@/lib/secure";

/**
 * GET /api/auth/me — current user from DB (fresh displayName/handle).
 * Slides the session cookie forward and refreshes identity from Mongo.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  try {
    const { db } = await connectToDatabase();
    let userDoc: UserRecord | null = null;
    try {
      userDoc = await db.collection<UserRecord>("users").findOne({
        _id: new ObjectId(session.id),
      });
    } catch {
      userDoc = null;
    }

    const handle = userDoc?.handle || session.handle;
    const displayName = userDoc?.displayName || session.displayName;
    const email = userDoc?.emailEnc
      ? decryptEmail(userDoc.emailEnc) || session.email
      : session.email;

    const token = await createSession({
      id: session.id,
      handle,
      displayName,
    });

    const res = NextResponse.json({
      user: {
        id: session.id,
        email,
        handle,
        displayName,
      },
    });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (e) {
    console.error(e);
    const token = await createSession({
      id: session.id,
      handle: session.handle,
      displayName: session.displayName,
    });
    const res = NextResponse.json({ user: session });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  }
}
