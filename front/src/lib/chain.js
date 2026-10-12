import {
  BroadcastDeadlineError,
  ContractConfigError,
  ContractUnavailableError,
  RpcError,
  getTransactionOutcome,
  startInvoke,
} from './contract';

// Keep a slow or hanging RPC well inside the serverless time limit. Past this
// deadline nothing is broadcast any more (see startInvoke).
const SUBMIT_TIMEOUT_MS = 15000;
// Once the broadcast request has left, how long to wait for the node's answer
// before recording the outcome as unknown.
const BROADCAST_GRACE_MS = 15000;

const TIMEOUT = Symbol('timeout');

function timer(ms) {
  let handle;
  const promise = new Promise((resolve) => {
    handle = setTimeout(() => resolve(TIMEOUT), ms);
  });
  return { promise, cancel: () => clearTimeout(handle) };
}

async function raceWithTimer(promise, ms) {
  const t = timer(ms);
  try {
    return await Promise.race([promise, t.promise]);
  } finally {
    t.cancel();
  }
}

function describeFailure(error) {
  if (error instanceof ContractConfigError) return `Server misconfigured: ${error.message}`;
  if (error instanceof ContractUnavailableError) return 'Starknet contract unavailable';
  if (error instanceof BroadcastDeadlineError) return 'Starknet RPC timed out before sending';
  return 'Starknet transaction failed';
}

// Submit a contract write and describe the result as the `chain` record stored
// on a document. `targetHash` is the hash the contract will hold for this
// document once the transaction is confirmed (null for a removal).
// Never throws: the database write has already happened, so a chain problem is
// recorded as status "failed" (definitely not sent) or "unknown" (it may have
// been sent but we never learned its hash).
export async function submitChainWrite(action, method, args, targetHash) {
  const base = { action, targetHash, updatedAt: new Date() };
  const deadline = Date.now() + SUBMIT_TIMEOUT_MS;
  const { result, hasBroadcast } = startInvoke(method, args, deadline);

  const record = (outcome) => {
    if (outcome === TIMEOUT) {
      return { ...base, status: 'unknown', error: 'Starknet RPC did not answer after sending; the transaction may or may not exist' };
    }
    return { ...base, txHash: outcome.transaction_hash, status: 'pending' };
  };
  const failure = (error) => {
    console.error(`Error submitting ${action} transaction`, error);
    if (hasBroadcast() && !(error instanceof RpcError)) {
      // The request left but the answer was lost: the node may have accepted it.
      return { ...base, status: 'unknown', error: 'Lost the Starknet RPC answer after sending' };
    }
    return { ...base, status: 'failed', error: describeFailure(error) };
  };

  try {
    const outcome = await raceWithTimer(result, SUBMIT_TIMEOUT_MS);
    if (outcome !== TIMEOUT) return record(outcome);
    if (!hasBroadcast()) {
      // From here on the guarded fetch refuses to broadcast, so "not sent" is final.
      result.catch(() => {});
      return { ...base, status: 'failed', error: 'Starknet RPC timed out before sending' };
    }
    return record(await raceWithTimer(result, BROADCAST_GRACE_MS));
  } catch (error) {
    return failure(error);
  }
}

// The hash the contract currently holds for this document, or null when it
// holds none. Documents saved before onChainHash existed were written to the
// chain by the old client code, so their hash counts as on-chain unless their
// chain record says otherwise.
export function getOnChainHash(doc) {
  if (doc.onChainHash !== undefined) return doc.onChainHash;
  if (!doc.chain || doc.chain.status === 'confirmed') return doc.hash;
  return null;
}

// Fields to $set on a document once its chain record reached a final outcome.
export function outcomeUpdate(doc, outcome) {
  const fields = { 'chain.status': outcome.status, 'chain.updatedAt': new Date() };
  if (outcome.status === 'confirmed') {
    fields.onChainHash = doc.chain.targetHash !== undefined ? doc.chain.targetHash : doc.hash;
  } else {
    fields.onChainHash = getOnChainHash(doc);
  }
  return fields;
}

// Before deriving the next write from a document, settle its pending
// transaction so the next update or removal starts from what is really on
// chain. Returns the refreshed document, or null if the transaction is still
// pending (or its status can't be read), in which case the caller must not
// sign a new write yet.
export async function settlePendingWrite(collection, doc) {
  if (doc.chain?.status !== 'pending' || !doc.chain.txHash) return doc;
  let outcome;
  try {
    outcome = await getTransactionOutcome(doc.chain.txHash);
  } catch (error) {
    console.error(`Error checking transaction ${doc.chain.txHash}`, error);
    return null;
  }
  if (outcome.status === 'pending') return null;
  const fields = outcomeUpdate(doc, outcome);
  await collection.updateOne({ _id: doc._id, 'chain.txHash': doc.chain.txHash }, { $set: fields });
  return { ...doc, onChainHash: fields.onChainHash, chain: { ...doc.chain, status: outcome.status } };
}
