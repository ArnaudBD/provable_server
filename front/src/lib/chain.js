import { ContractConfigError, ContractUnavailableError } from './contract';

// Keep a slow or hanging RPC well inside the serverless time limit.
const SUBMIT_TIMEOUT_MS = 15000;

class SubmitTimeoutError extends Error {}

function withTimeout(promise, ms) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new SubmitTimeoutError(`Timed out after ${ms}ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function describeFailure(error) {
  if (error instanceof ContractConfigError) return `Server misconfigured: ${error.message}`;
  if (error instanceof ContractUnavailableError) return 'Starknet contract unavailable';
  if (error instanceof SubmitTimeoutError) return 'Starknet RPC timed out';
  return 'Starknet transaction failed';
}

// Submit a contract write and describe the result as the `chain` record stored
// on a document and returned to the client. Never throws: the database write
// has already happened, so a chain failure is recorded as status "failed".
export async function submitChainWrite(action, submit) {
  const now = new Date();
  try {
    const result = await withTimeout(Promise.resolve().then(submit), SUBMIT_TIMEOUT_MS);
    return { action, txHash: result.transaction_hash, status: 'pending', updatedAt: now };
  } catch (error) {
    console.error(`Error submitting ${action} transaction`, error);
    return { action, status: 'failed', error: describeFailure(error), updatedAt: now };
  }
}
