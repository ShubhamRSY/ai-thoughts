// Seed MongoDB with initial collections and demo data.
// Usage:  npm run seed   (loads MONGODB_URL from .env.local)
import { MongoClient } from "mongodb";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Load .env.local manually (avoid adding a dotenv dependency).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !(m[1].trim() in process.env)) process.env[m[1].trim()] = m[2].trim();
  }
}

const uri = process.env.MONGODB_URL || process.env.MONGODB_URI;
if (!uri) {
  console.error("Set MONGODB_URL first (e.g. mongodb+srv://user:pass@cluster/...)");
  process.exit(1);
}
const dbName = process.env.MONGODB_DB || "aithoughts";

const client = new MongoClient(uri);
await client.connect();
const db = client.db(dbName);

// Create indexes for the collection so the app is fast.
await db.collection("posts").createIndex({ created_at: -1 });
await db.collection("messages").createIndex({ post_id: 1, created_at: 1 });
await db.collection("reactions").createIndex({ post_id: 1 });
await db.collection("reports").createIndex({ status: 1, created_at: -1 });
await db.collection("keepers").createIndex({ handle: 1 }, { unique: true });
await db.collection("profiles").createIndex({ handle: 1 }, { unique: true });

// Demo takes (only if the posts collection is empty).
const existing = await db.collection("posts").countDocuments();
if (existing > 0) {
  console.log("posts already has data — skipping demo seed. (indexes created)");
  await client.close();
  process.exit(0);
}

const demo = [
  {
    handle: "@maravoss", author: "Mara Voss",
    content: "Honestly, Copilot's autocompletion is SO sleek when you're in flow. But then you paste the same snippet in the wrong file and it politely gaslights you.",
    media_type: "text", feeling: "using-it", tags: ["#Sleek", "#Tools"],
    language: "en", language_label: "English",
    integrity_hash: "3a9f2c1e8b7d4f0a", integrity_verified: true,
    integrity_label: "Verified · Unmodified",
    created_at: new Date(Date.now() - 2 * 3600e3),
  },
  {
    handle: "@dexbuilds", author: "Dex Okafor",
    content: "Acabo de subir un proyecto donde un agente de IA escribió el 80% de la noche a la mañana. ¿Es este el futuro?",
    media_type: "text", feeling: "blown-away", tags: ["#Jobs", "#Future"],
    language: "es", language_label: "Español",
    integrity_hash: "f4e2c9a1b7d38e56", integrity_verified: true,
    integrity_label: "Verified · Unmodified",
    created_at: new Date(Date.now() - 4 * 3600e3),
  },
  {
    handle: "@priyathinks", author: "Priya Raman",
    content: "I asked an AI to explain recursion to my mum. It built a story about matryoshka dolls filling up the kitchen. She finally got it.",
    media_type: "text", feeling: "loves-it", tags: ["#Future", "#Tools"],
    language: "en", language_label: "English",
    integrity_hash: "a1b2c3d4", integrity_verified: true,
    integrity_label: "Verified · Unmodified",
    created_at: new Date(Date.now() - 6 * 3600e3),
  },
];

await db.collection("posts").insertMany(demo);
console.log(`Seeded ${demo.length} demo posts + created indexes.`);
await client.close();
