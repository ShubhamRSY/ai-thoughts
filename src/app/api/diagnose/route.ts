import { NextResponse } from "next/server";
import tls from "node:tls";

export const dynamic = "force-dynamic";

const SHARD = "ac-jyd0fi8-shard-00-00.fc1wbd0.mongodb.net";
const CLUSTER = "cluster0.fc1wbd0.mongodb.net";
const PORT = 27017;

function hs(label: string, host: string, opts: tls.ConnectionOptions): Promise<string> {
  return new Promise((res) => {
    let done = false;
    const s = tls.connect({ host, port: PORT, family: 4, ...opts } as tls.ConnectionOptions);
    const to = setTimeout(() => { if (!done) { done = true; s.destroy(); res("timeout"); } }, 15000);
    s.on("secureConnect", () => { if (!done) { done = true; clearTimeout(to); s.destroy(); res(`secure(${s.getProtocol() ?? "?"})`); } });
    s.on("error", (e) => { if (!done) { done = true; clearTimeout(to); res("err: " + String(e.message || e).slice(0, 80)); } });
  });
}

export async function GET() {
  const r = {
    nodeV: process.version,
    shard_sni_shard: await hs("a", SHARD, { servername: SHARD }),
    shard_sni_cluster: await hs("b", SHARD, { servername: CLUSTER }),
    cluster_sni_cluster: await hs("c", CLUSTER, { servername: CLUSTER }),
    cluster_noSNI: await hs("d", CLUSTER, { servername: "" }),
  };
  return NextResponse.json(r);
}
