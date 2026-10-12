// Server-only: this module reads PRIVATE_KEY and signs transactions. Import it
// from API routes only, never from client components.
import { RpcProvider, Contract, Account, hash } from 'starknet';

export const contractAddress = '0x04b306b10d8be501edc8ba8de2b318b103398b61b3c6aa6570cc891533088b72';

export class ContractUnavailableError extends Error {}
// A missing or malformed env var. Its message names the variable and holds no
// secret, so it is safe to show to users.
export class ContractConfigError extends ContractUnavailableError {}

// Cached across warm invocations; reset on failure so the next call retries.
let contractPromise = null;

export function getProvider() {
  // No built-in default: public Sepolia endpoints keep disappearing, so the
  // deployment must name one it has checked (see `npm run check:rpc`).
  const nodeUrl = process.env.STARKNET_RPC_URL;
  if (!nodeUrl) {
    throw new ContractConfigError('STARKNET_RPC_URL environment variable is not set');
  }
  return new RpcProvider({ nodeUrl });
}

async function initializeContract() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new ContractConfigError('PRIVATE_KEY environment variable is not set');
  }
  // The deployed Starknet account that PRIVATE_KEY signs for; it pays the fees.
  const accountAddress = process.env.ACCOUNT_ADDRESS;
  if (!accountAddress) {
    throw new ContractConfigError('ACCOUNT_ADDRESS environment variable is not set');
  }
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(accountAddress)) {
    throw new ContractConfigError('ACCOUNT_ADDRESS must be a 0x-prefixed hex address');
  }
  const provider = getProvider();
  const account = new Account({ provider, address: accountAddress, signer: privateKey });
  let abi;
  try {
    ({ abi } = await provider.getClassAt(contractAddress));
  } catch (error) {
    throw new ContractUnavailableError(`Could not load contract from Starknet RPC: ${error.message}`);
  }
  if (!abi) {
    throw new ContractUnavailableError('No ABI found for contract');
  }
  return new Contract({ abi, address: contractAddress, providerOrAccount: account });
}

export function getContract() {
  if (!contractPromise) {
    contractPromise = initializeContract().catch((error) => {
      contractPromise = null;
      console.error('Error initializing contract:', error);
      throw error;
    });
  }
  return contractPromise;
}

export function hashText(text) {
  return hash.starknetKeccak(text).toString();
}

// Write functions return once the transaction is submitted; callers record it as
// pending and resolve the outcome later with getTransactionOutcome, so API
// routes don't wait for block inclusion inside a serverless time limit.

export async function createFile(path, contentHash) {
  const contract = await getContract();
  return contract.invoke('create_file', [path, contentHash]);
}

export async function updateFile(path, prevContentHash, newContentHash) {
  const contract = await getContract();
  return contract.invoke('update', [path, prevContentHash, newContentHash]);
}

export async function removeFile(contentHash) {
  const contract = await getContract();
  return contract.invoke('remove', [contentHash]);
}

export async function getFileCount() {
  const contract = await getContract();
  return contract.call('get_file_count');
}

export async function getFile(contentHash) {
  const contract = await getContract();
  return contract.call('get_file', [contentHash]);
}

// Maps the node's view of a transaction to 'pending' | 'confirmed' | 'rejected'.
export async function getTransactionOutcome(transactionHash) {
  const provider = getProvider();
  let status;
  try {
    status = await provider.getTransactionStatus(transactionHash);
  } catch (error) {
    // Nodes answer "transaction hash not found" until they have seen the tx.
    if (/not found/i.test(error.message)) return { status: 'pending' };
    throw error;
  }
  const { finality_status: finality, execution_status: execution } = status;
  if (finality === 'REJECTED' || execution === 'REVERTED') {
    return { status: 'rejected', finality, execution };
  }
  if ((finality === 'ACCEPTED_ON_L2' || finality === 'ACCEPTED_ON_L1') && execution === 'SUCCEEDED') {
    return { status: 'confirmed', finality, execution };
  }
  return { status: 'pending', finality, execution };
}
