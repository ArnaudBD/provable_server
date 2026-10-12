import { createHash, timingSafeEqual } from 'crypto';
import { sendError } from './api';

export const WRITE_PASSWORD_HEADER = 'x-write-password';

const digest = (value) => createHash('sha256').update(value).digest();

// Every route that writes to the database or signs a Starknet transaction calls
// this first. Writes stay disabled until WRITE_PASSWORD is configured.
export function requireWritePassword(req, res) {
  const expected = process.env.WRITE_PASSWORD;
  if (!expected) {
    sendError(res, 503, 'Writes are disabled: WRITE_PASSWORD is not set');
    return false;
  }
  const provided = req.headers[WRITE_PASSWORD_HEADER];
  if (typeof provided !== 'string' || !timingSafeEqual(digest(provided), digest(expected))) {
    sendError(res, 401, 'A valid write password is required');
    return false;
  }
  return true;
}
