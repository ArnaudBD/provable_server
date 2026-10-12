import { sendDatabaseError, sendError } from './api';
import { getClientId, hit, retryAfterSeconds } from './rateLimit';

// Writes per client; each one can sign a Starknet transaction paid by the server account.
const MAX_WRITES = 30;
const WRITE_WINDOW_MS = 10 * 60 * 1000;

// Every route that writes to the database or signs a Starknet transaction calls this first.
export async function checkWriteRateLimit(req, res) {
  try {
    const writes = await hit('write', getClientId(req), WRITE_WINDOW_MS);
    if (writes.count > MAX_WRITES) {
      res.setHeader('Retry-After', String(retryAfterSeconds(writes.resetAt)));
      sendError(res, 429, 'Too many writes, try again later');
      return false;
    }
  } catch (error) {
    sendDatabaseError(res, error, 'Error checking write rate limit');
    return false;
  }
  return true;
}
