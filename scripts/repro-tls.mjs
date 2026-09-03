import { MongoClient, ServerApiVersion } from "mongodb";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const envPath = resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !(m[1].trim() in process.env)) process.env[m[1].trim()] = m[2].trim();
  }
}
const URI = process.env.MONGODB_URI;

async function attempt(label, opts) {
  try {
    const c = await MongoClient.connect(URI, {
      serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: false },
      family: 4,
      autoSelectFamily: false,
      serverSelectionTimeoutMS: 15000,
      tls: true,
      ...opts,
    });
    const n = await c.db("aithoughts").collection("posts").countDocuments();
    console.log(label, "-> SUCCESS posts:", n);
    await c.close();
    return true;
  } catch (e) {
    console.log(label, "-> FAIL:", String(e?.message || e).slice(0, 160));
    return false;
  }
}

await attempt("default", {});
await attempt("tls1.2 ciphers", {
  secureProtocol: "TLSv1_2_method",
  ciphers: ["ECDHE-ECDSA-AES128-GCM-SHA256","ECDHE-RSA-AES128-GCM-SHA256","ECDHE-ECDSA-AES256-GCM-SHA384","ECDHE-RSA-AES256-GCM-SHA384","AES128-GCM-SHA256","AES256-GCM-SHA384"].join(":"),
});
await attempt("rejectUnauthorized:false", { rejectUnauthorized: false });
await attempt("tls1.2 + rejectUnauthorized:false", { secureProtocol: "TLSv1_2_method", rejectUnauthorized: false });
