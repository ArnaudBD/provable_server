// Server-only: this module reads PRIVATE_KEY and signs transactions. Import it
// from API routes only, never from client components.
import { RpcProvider, RpcError, Contract, Account, hash } from 'starknet';

export const contractAddress = '0x04b306b10d8be501edc8ba8de2b318b103398b61b3c6aa6570cc891533088b72';

export class ContractUnavailableError extends Error {}
// A missing or malformed env var. Its message names the variable and holds no
// secret, so it is safe to show to users.
export class ContractConfigError extends ContractUnavailableError {}
// Raised instead of broadcasting once a submission's deadline has passed.
export class BroadcastDeadlineError extends Error {}

export { RpcError };

function getNodeUrl() {
  // No built-in default: public Sepolia endpoints keep disappearing, so the
  // deployment must name one it has checked (see `npm run check:rpc`).
  const nodeUrl = process.env.STARKNET_RPC_URL;
  if (!nodeUrl) {
    throw new ContractConfigError('STARKNET_RPC_URL environment variable is not set');
  }
  return nodeUrl;
}

export function getProvider(options = {}) {
  return new RpcProvider({ nodeUrl: getNodeUrl(), ...options });
}

function getSignerConfig() {
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
  return { privateKey, accountAddress };
}

// The ABI is cached across warm invocations; reset on failure so the next call retries.
let abiPromise = null;

function getAbi() {
  if (!abiPromise) {
    abiPromise = (async () => {
      let abi;
      try {
        ({ abi } = await getProvider().getClassAt(contractAddress));
      } catch (error) {
        throw new ContractUnavailableError(`Could not load contract from Starknet RPC: ${error.message}`);
      }
      if (!abi) throw new ContractUnavailableError('No ABI found for contract');
      return abi;
    })().catch((error) => {
      abiPromise = null;
      console.error('Error loading contract ABI:', error);
      throw error;
    });
  }
  return abiPromise;
}

export async function getContract() {
  return new Contract({ abi: await getAbi(), address: contractAddress, providerOrAccount: getProvider() });
}

export function hashText(text) {
  return hash.starknetKeccak(text).toString();
}

// Signs and sends one contract write. Everything before the broadcast (ABI,
// nonce, fee estimation, signing) may run until `deadline`; after that the
// guarded fetch refuses to send starknet_addInvokeTransaction, so a caller
// that gave up waiting can safely record the write as not sent.
// hasBroadcast() tells whether the transaction may already have left.
export function startInvoke(method, args, deadline) {
  let broadcastStarted = false;
  const guardedFetch = (url, init) => {
    if (typeof init?.body === 'string' && init.body.includes('"starknet_addInvokeTransaction"')) {
      if (Date.now() > deadline) {
        return Promise.reject(new BroadcastDeadlineError('Deadline passed before broadcast'));
      }
      broadcastStarted = true;
    }
    return fetch(url, init);
  };

  const result = (async () => {
    const { privateKey, accountAddress } = getSignerConfig();
    const provider = getProvider({ baseFetch: guardedFetch });
    const account = new Account({ provider, address: accountAddress, signer: privateKey });
    const contract = new Contract({ abi: await getAbi(), address: contractAddress, providerOrAccount: account });
    return contract.invoke(method, args);
  })();

  return { result, hasBroadcast: () => broadcastStarted };
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
