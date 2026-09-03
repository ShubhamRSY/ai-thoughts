import { MongoClient, ServerApiVersion, type Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URI ?? "";
const DB_NAME = process.env.MONGODB_DB ?? "aithoughts";

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export function isMongoConfigured(): boolean {
  return Boolean(MONGODB_URI);
}

export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  if (cachedClient && cachedDb) {
    return { client: cachedClient, db: cachedDb };
  }

  if (!MONGODB_URI) {
    throw new Error("MONGODB_URI is not set");
  }

  const client = await MongoClient.connect(MONGODB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: false,
      deprecationErrors: false,
    },
    autoSelectFamily: false,
    family: 4,
    serverSelectionTimeoutMS: 30000,
    connectTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    retryWrites: true,
    tls: true,
    // Vercel's Node 24/OpenSSL offers ciphers Atlas M0 rejects during the
    // handshake (server responds "tlsv1 alert internal error", alert 80).
    // Constrain the negotiated cipher suite + TLS version to what Atlas accepts.
    secureProtocol: "TLSv1_2_method",
    ciphers: [
      "ECDHE-ECDSA-AES128-GCM-SHA256",
      "ECDHE-RSA-AES128-GCM-SHA256",
      "ECDHE-ECDSA-AES256-GCM-SHA384",
      "ECDHE-RSA-AES256-GCM-SHA384",
      "AES128-GCM-SHA256",
      "AES256-GCM-SHA384",
    ].join(":"),
  });
  const db = client.db(DB_NAME);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}
