import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const nodeV = process.version;
  const uri = process.env.MONGODB_URI ?? "";
  const scheme = uri.split("://")[0] ?? "";
  const host = uri.includes("@") ? uri.split("@")[1]?.split("/")[0] : "";
  const hasTls = uri.includes("tls=true") || uri.startsWith("mongodb+srv");

  let ping = null;
  let error = null;
  try {
    const { connectToDatabase } = await import("@/lib/mongodb");
    const start = Date.now();
    const { db } = await connectToDatabase();
    await db.command({ ping: 1 });
    ping = { ok: true, ms: Date.now() - start };
  } catch (e) {
    error = String((e as Error).message ?? e).slice(0, 500);
  }

  return NextResponse.json({ nodeV, scheme, host, hasTls, ping, error });
}
