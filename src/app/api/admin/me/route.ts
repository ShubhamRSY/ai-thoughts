import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";

/** GET /api/admin/me — is the signed-in user a global admin? */
export async function GET() {
  const gate = await requireAdminSession();
  if (!gate.ok) {
    return NextResponse.json(
      { isAdmin: false, error: gate.error },
      { status: gate.status }
    );
  }
  return NextResponse.json({
    isAdmin: true,
    handle: gate.session.handle,
    displayName: gate.session.displayName,
  });
}
