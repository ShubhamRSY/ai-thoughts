import { MongoClient, ServerApiVersion, type Db } from "mongodb";

const MONGODB_URI = process.env.MONGODB_URL ?? process.env.MONGODB_URI ?? "";
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
  });
  const db = client.db(DB_NAME);

  cachedClient = client;
  cachedDb = db;

  return { client, db };
}
