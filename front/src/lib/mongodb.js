import { MongoClient } from 'mongodb';

const DEFAULT_DB_NAME = 'myDatabase';
export const COLLECTION_NAME = 'myCollection';

// Cache the connection promise on globalThis so hot reloads in dev and warm
// serverless invocations on Vercel reuse a single MongoClient.
const cache = globalThis._mongoClientCache || (globalThis._mongoClientCache = { promise: null });

export class DatabaseConfigError extends Error {}

function connect() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new DatabaseConfigError('MONGODB_URI environment variable is not set');
  }
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
  return client.connect();
}

export async function getClient() {
  if (!cache.promise) {
    cache.promise = connect().catch((error) => {
      // Drop the failed attempt so the next request retries instead of
      // reusing a rejected promise forever.
      cache.promise = null;
      throw error;
    });
  }
  return cache.promise;
}

export async function getDb() {
  const client = await getClient();
  return client.db(process.env.MONGODB_DB || DEFAULT_DB_NAME);
}

export async function getCollection() {
  const db = await getDb();
  return db.collection(COLLECTION_NAME);
}
