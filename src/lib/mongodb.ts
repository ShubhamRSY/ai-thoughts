import { MongoClient, ServerApiVersion, type Db } from "mongodb";
import { attachDatabasePool } from "@vercel/functions";

const MONGODB_URI = process.env.MONGODB_URL ?? process.env.MONGODB_URI ?? "";
const DB_NAME = process.env.MONGODB_DB ?? "aithoughts";

// The in-flight connect is cached, not just its result: caching only after
// `await` let every request in a cold-start burst open its own client + pool
// (200 concurrent → 412 server connections in a load test).
let connection: Promise<{ client: MongoClient; db: Db }> | null = null;

export function isMongoConfigured(): boolean {
  return Boolean(MONGODB_URI);
}

export function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  connection ??= connect().catch((e) => {
    connection = null; // let the next request retry instead of caching the failure
    throw e;
  });
  return connection;
}

async function connect(): Promise<{ client: MongoClient; db: Db }> {
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
    // Fail fast when the DB is unreachable: at 30s/15s every request hung ~25s
    // during an outage (load test), pinning function instances and making
    // /api/health useless as a liveness signal. 5s covers a slow Atlas handshake.
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
    socketTimeoutMS: 45000,
    retryWrites: true,
    tls: true,
    maxIdleTimeMS: 10000,
  });

  // Register the pool with Vercel serverless so connections are suspended and
  // resumed cleanly (prevents connection leaks / exhausted pools on cold starts).
  attachDatabasePool(client);

  return { client, db: client.db(DB_NAME) };
}
