import { MongoClient, ServerApiVersion, type Db } from "mongodb";
import { attachDatabasePool } from "@vercel/functions";

const MONGODB_URI = process.env.MONGODB_URL ?? process.env.MONGODB_URI ?? "";
// `vercel env pull` writes the live cluster into .env.local, so `next dev`
// (and the e2e suite, which runs it) would otherwise write to production data.
// Outside a production build every run uses a sibling "<db>_dev" database.
export const DB_NAME = dbName(process.env.MONGODB_DB ?? "aithoughts", process.env.NODE_ENV);

export function dbName(base: string, nodeEnv: string | undefined): string {
  return nodeEnv === "production" || base.endsWith("_dev") ? base : `${base}_dev`;
}

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
    // A frozen (reachable but unresponsive) server passed selection and then
    // sat on the socket until the old 45s socketTimeoutMS. timeoutMS caps every
    // operation end to end; long cursors (backup) opt into per-batch timing.
    timeoutMS: 8000,
    retryWrites: true,
    tls: true,
    maxIdleTimeMS: 10000,
  });

  // Register the pool with Vercel serverless so connections are suspended and
  // resumed cleanly (prevents connection leaks / exhausted pools on cold starts).
  attachDatabasePool(client);

  return { client, db: client.db(DB_NAME) };
}
