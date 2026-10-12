import { getDb } from './mongodb';

// Fixed-window counters stored in MongoDB, so every serverless instance shares
// them. Documents expire through a TTL index once their window is over.
const COLLECTION_NAME = 'rateLimits';
let indexPromise = null;

async function getRateLimitCollection() {
  const collection = (await getDb()).collection(COLLECTION_NAME);
  if (!indexPromise) {
    indexPromise = collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }).catch((error) => {
      indexPromise = null;
      console.error('Error creating rate limit TTL index', error);
    });
  }
  await indexPromise;
  return collection;
}

function windowKey(scope, clientId, windowMs) {
  const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
  return { id: `${scope}:${clientId}:${windowStart}`, resetAt: windowStart + windowMs };
}

// Vercel sets x-real-ip / x-forwarded-for itself, so they can't be spoofed there.
export function getClientId(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const first = typeof forwarded === 'string' ? forwarded.split(',')[0].trim() : '';
  return req.headers['x-real-ip'] || first || req.socket?.remoteAddress || 'unknown';
}

// Counts one hit and returns the new total for the current window.
export async function hit(scope, clientId, windowMs) {
  const { id, resetAt } = windowKey(scope, clientId, windowMs);
  const collection = await getRateLimitCollection();
  const doc = await collection.findOneAndUpdate(
    { _id: id },
    { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(resetAt) } },
    { upsert: true, returnDocument: 'after' },
  );
  return { count: doc.count, resetAt };
}

export function retryAfterSeconds(resetAt) {
  return Math.max(1, Math.ceil((resetAt - Date.now()) / 1000));
}
