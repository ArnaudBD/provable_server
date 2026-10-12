import { DatabaseConfigError } from './mongodb';

export function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

export function methodNotAllowed(req, res, allowed) {
  res.setHeader('Allow', allowed);
  return sendError(res, 405, `Method ${req.method} Not Allowed`);
}

// Map a database failure to a JSON error: unreachable or unconfigured DB is 503,
// anything else is a 500.
export function sendDatabaseError(res, error, context) {
  console.error(context, error);
  if (error instanceof DatabaseConfigError) {
    return sendError(res, 503, 'Database is not configured');
  }
  if (error && /MongoServerSelectionError|MongoNetworkError|MongoTopologyClosedError/.test(error.name)) {
    return sendError(res, 503, 'Database unavailable');
  }
  return sendError(res, 500, 'Internal Server Error');
}
