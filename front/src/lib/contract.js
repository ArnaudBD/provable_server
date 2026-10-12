// Server-only: this module reads PRIVATE_KEY and signs transactions. Import it
// from API routes only, never from client components.
import { RpcProvider, Contract, Account, hash } from 'starknet';

const account0Address = '0x02e6721d8276a16dbfccf2416a2d5fecd40d8adaf6ef528d4aea24f63d3cc03b'; // make sure ur wallet has some eth from the faucet
export const contractAddress = '0x04b306b10d8be501edc8ba8de2b318b103398b61b3c6aa6570cc891533088b72';

export class ContractUnavailableError extends Error {}

// Cached across warm invocations; reset on failure so the next call retries.
let contractPromise = null;

export function getProvider() {
  // No built-in default: public Sepolia endpoints keep disappearing, so the
  // deployment must name one it has checked (see `npm run check:rpc`).
  const nodeUrl = process.env.STARKNET_RPC_URL;
  if (!nodeUrl) {
    throw new ContractUnavailableError('STARKNET_RPC_URL environment variable is not set');
  }
  return new RpcProvider({ nodeUrl });
}

async function initializeContract() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new ContractUnavailableError('PRIVATE_KEY environment variable is not set');
  }
  const provider = getProvider();
  const account = new Account({ provider, address: account0Address, signer: privateKey });
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
