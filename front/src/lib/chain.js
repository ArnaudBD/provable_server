import { ContractUnavailableError } from './contract';

// Submit a contract write and describe the result as the `chain` record stored
// on a document and returned to the client. Never throws: the database write
// has already happened, so a chain failure is reported, not raised.
export async function submitChainWrite(action, submit) {
  const now = new Date();
  try {
    const result = await submit();
    return { action, txHash: result.transaction_hash, status: 'pending', updatedAt: now };
  } catch (error) {
    console.error(`Error submitting ${action} transaction`, error);
    const message = error instanceof ContractUnavailableError ? 'Starknet contract unavailable' : 'Starknet transaction failed';
    return { action, status: 'failed', error: message, updatedAt: now };
  }
}
