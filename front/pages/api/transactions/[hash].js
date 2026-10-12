import { getCollection } from '../../../src/lib/mongodb';
import { outcomeUpdate } from '../../../src/lib/chain';
import { methodNotAllowed, sendError } from '../../../src/lib/api';
import { ContractUnavailableError, getTransactionOutcome } from '../../../src/lib/contract';

// Read-only: reports whether a submitted transaction was confirmed or rejected,
// and records a final outcome on the document that submitted it.
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return methodNotAllowed(req, res, ['GET']);
  }

  const { hash } = req.query;
  if (typeof hash !== 'string' || !/^0x[0-9a-fA-F]{1,64}$/.test(hash)) {
    return sendError(res, 400, 'Invalid transaction hash');
  }

  let outcome;
  try {
    outcome = await getTransactionOutcome(hash);
  } catch (error) {
    if (error instanceof ContractUnavailableError) {
      return sendError(res, 503, 'Starknet RPC unavailable');
    }
    console.error(`Error fetching status of ${hash}`, error);
    return sendError(res, 502, 'Could not fetch transaction status');
  }

  if (outcome.status !== 'pending') {
    try {
      const collection = await getCollection();
      const doc = await collection.findOne({ 'chain.txHash': hash, 'chain.status': 'pending' });
      if (doc) {
        await collection.updateOne({ _id: doc._id, 'chain.txHash': hash }, { $set: outcomeUpdate(doc, outcome) });
      }
    } catch (error) {
      // The chain answer is still correct; the stored record catches up on the next check.
      console.error(`Error recording outcome of ${hash}`, error);
    }
  }

  return res.status(200).json({ transactionHash: hash, ...outcome });
}
