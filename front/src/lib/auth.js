import { createHash, timingSafeEqual } from 'crypto';
import { sendDatabaseError, sendError } from './api';
import { getClientId, hit, peek, retryAfterSeconds } from './rateLimit';

export const WRITE_PASSWORD_HEADER = 'x-write-password';

// Wrong passwords per client before writes are locked out for the window.
const MAX_FAILED_ATTEMPTS = 5;
const FAILED_ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
// Authorized writes per client; each one can sign a Starknet transaction.
const MAX_WRITES = 30;
const WRITE_WINDOW_MS = 10 * 60 * 1000;

const digest = (value) => createHash('sha256').update(value).digest();

function tooManyRequests(res, resetAt, message) {
  res.setHeader('Retry-After', String(retryAfterSeconds(resetAt)));
  return sendError(res, 429, message);
}

// Every route that writes to the database or signs a Starknet transaction calls
// this first. Writes stay disabled until WRITE_PASSWORD is configured.
export async function requireWritePassword(req, res) {
  const expected = process.env.WRITE_PASSWORD;
  if (!expected) {
    sendError(res, 503, 'Writes are disabled: WRITE_PASSWORD is not set');
    return false;
  }

  const clientId = getClientId(req);
  try {
    const failures = await peek('auth-fail', clientId, FAILED_ATTEMPT_WINDOW_MS);
    if (failures.count >= MAX_FAILED_ATTEMPTS) {
      tooManyRequests(res, failures.resetAt, 'Too many wrong passwords, try again later');
      return false;
    }

    const provided = req.headers[WRITE_PASSWORD_HEADER];
    if (typeof provided !== 'string' || !timingSafeEqual(digest(provided), digest(expected))) {
      // A request without any password is the UI asking for one, not a guess.
      if (typeof provided === 'string' && provided) {
        await hit('auth-fail', clientId, FAILED_ATTEMPT_WINDOW_MS);
      }
      sendError(res, 401, 'A valid write password is required');
      return false;
    }

    const writes = await hit('write', clientId, WRITE_WINDOW_MS);
    if (writes.count > MAX_WRITES) {
      tooManyRequests(res, writes.resetAt, 'Too many writes, try again later');
      return false;
    }
  } catch (error) {
    sendDatabaseError(res, error, 'Error checking write rate limit');
    return false;
  }
  return true;
}
