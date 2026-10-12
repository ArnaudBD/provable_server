// Server-side Starknet writes. The browser posts here instead of importing
// src/lib/contract.js, so PRIVATE_KEY never leaves the server.
import { ContractUnavailableError, createFile, removeFile, updateFile } from '../../src/lib/contract';
import { methodNotAllowed, sendError } from '../../src/lib/api';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return methodNotAllowed(req, res, ['POST']);
  }

  const { action, path, contentHash, prevContentHash } = req.body || {};
  let submit;
  if (action === 'create') {
    if (!path || !contentHash) return sendError(res, 400, 'path and contentHash are required');
    submit = () => createFile(path, contentHash);
  } else if (action === 'update') {
    if (!path || !prevContentHash || !contentHash) {
      return sendError(res, 400, 'path, prevContentHash and contentHash are required');
    }
    submit = () => updateFile(path, prevContentHash, contentHash);
  } else if (action === 'remove') {
    if (!contentHash) return sendError(res, 400, 'contentHash is required');
    submit = () => removeFile(contentHash);
  } else {
    return sendError(res, 400, 'action must be one of create, update, remove');
  }

  try {
    const result = await submit();
    return res.status(200).json({ transactionHash: result.transaction_hash });
  } catch (error) {
    if (error instanceof ContractUnavailableError) {
      return sendError(res, 503, 'Starknet contract unavailable');
    }
    console.error(`Error submitting ${action} transaction`, error);
    return sendError(res, 502, 'Starknet transaction failed');
  }
}
