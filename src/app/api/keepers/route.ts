import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { isKeeperUser } from "@/lib/admin";
import { reportError } from "@/lib/report-error";

// "Am I a keeper?" — for the /keeper page to decide what to show. It answers
// only about the signed-in caller: asking about arbitrary handles let any
// member map the moderator roster, and it also answered "yes" for handles no
// account held, pointing straight at roles waiting to be inherited (H1).
// A ?handle= parameter is ignored. Keepers are granted from /admin.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: "Sign in required" }, { status: 401 });
    }
    return NextResponse.json({ isKeeper: await isKeeperUser(session.id) });
  } catch (error) {
    console.error(error);
    reportError(error, { route: "api/keepers" });
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
