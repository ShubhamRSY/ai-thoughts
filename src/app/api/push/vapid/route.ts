import { NextResponse } from "next/server";
import { getVapidPublicKey } from "@/lib/push";

export async function GET() {
  const key = getVapidPublicKey();
  if (!key) {
    return NextResponse.json(
      { configured: false, error: "Web Push is not configured yet" },
      { status: 503 }
    );
  }
  return NextResponse.json({ configured: true, publicKey: key });
}
