// Server-only: this module reads PRIVATE_KEY and signs transactions. Import it
// from API routes only, never from client components.
import { RpcProvider, Contract, Account } from 'starknet';

export const DEFAULT_STARKNET_RPC_URL = 'https://free-rpc.nethermind.io/sepolia-juno/v0_7';

const account0Address = '0x02e6721d8276a16dbfccf2416a2d5fecd40d8adaf6ef528d4aea24f63d3cc03b'; // make sure ur wallet has some eth from the faucet
const contractAddress = '0x04b306b10d8be501edc8ba8de2b318b103398b61b3c6aa6570cc891533088b72';

export class ContractUnavailableError extends Error {}

// Cached across warm invocations; reset on failure so the next call retries.
let contractPromise = null;

function getProvider() {
  return new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL || DEFAULT_STARKNET_RPC_URL });
}

async function initializeContract() {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    throw new ContractUnavailableError('PRIVATE_KEY environment variable is not set');
  }
  const provider = getProvider();
  const account = new Account(provider, account0Address, privateKey);
  let abi;
  try {
    ({ abi } = await provider.getClassAt(contractAddress));
  } catch (error) {
    throw new ContractUnavailableError(`Could not load contract from Starknet RPC: ${error.message}`);
  }
  if (!abi) {
    throw new ContractUnavailableError('No ABI found for contract');
  }
  const contract = new Contract(abi, contractAddress, provider);
  contract.connect(account);
  return contract;
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

// Write functions return as soon as the transaction is submitted, so API routes
// don't sit waiting for block inclusion inside a serverless time limit.

export async function createFile(path, contentHash) {
  const contract = await getContract();
  const myCall = contract.populate('create_file', [path, contentHash]);
  return contract.create_file(myCall.calldata);
}

export async function updateFile(path, prevContentHash, newContentHash) {
  const contract = await getContract();
  const myCall = contract.populate('update', [path, prevContentHash, newContentHash]);
  return contract.update(myCall.calldata);
}

export async function removeFile(contentHash) {
  const contract = await getContract();
  const myCall = contract.populate('remove', [contentHash]);
  return contract.remove(myCall.calldata);
}

export async function getFileCount() {
  const contract = await getContract();
  return contract.get_file_count();
}

export async function getFile(contentHash) {
  const contract = await getContract();
  return contract.get_file(contentHash);
}
