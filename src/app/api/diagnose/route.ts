import { NextResponse } from "next/server";
import net from "node:net";
import tls from "node:tls";

export const dynamic = "force-dynamic";

const HOST = "ac-jyd0fi8-shard-00-00.fc1wbd0.mongodb.net";
const PORT = 27017;

export async function GET() {
  const result: { tcp: string | null; tls: string | null; tlsError: string | null } = { tcp: null, tls: null, tlsError: null };

  // 1. Raw TCP connect
  result.tcp = await new Promise<string>((res) => {
    const s = net.connect({ host: HOST, port: PORT, family: 4 });
    const to = setTimeout(() => { s.destroy(); res("timeout"); }, 10000);
    s.on("connect", () => { clearTimeout(to); s.destroy(); res("connected"); });
    s.on("error", (e) => { clearTimeout(to); res("error: " + String(e.message).slice(0, 80)); });
  });

  // 2. TLS handshake (Node default, no SNI tweak)
  result.tls = await new Promise<string>((res) => {
    const s = tls.connect(
      { host: HOST, port: PORT, family: 4, servername: HOST } as tls.ConnectionOptions
    );
    const to = setTimeout(() => { s.destroy(); res("tls-timeout"); }, 15000);
    s.on("secureConnect", () => {
      clearTimeout(to);
      const proto = s.getProtocol();
      const cipher = s.getCipher?.()?.name ?? "?";
      s.destroy();
      res(`secure(${proto},${cipher})`);
    });
    s.on("error", (e) => { clearTimeout(to); result.tlsError = String(e.message || e).slice(0, 200); res("tls-error: " + String(e.message || e).slice(0, 120)); });
  });

  return NextResponse.json({ nodeV: process.version, host: HOST, port: PORT, ...result });
}
