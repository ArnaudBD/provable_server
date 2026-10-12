// Checks that STARKNET_RPC_URL works for this app: reads the spec version,
// loads the contract ABI and calls get_file_count. Sends no transaction.
// Usage: npm run check:rpc   (reads .env / .env.local like `next dev`)
import nextEnv from '@next/env';
import { Contract, RpcProvider } from 'starknet';

nextEnv.loadEnvConfig(process.cwd());

const contractAddress = '0x04b306b10d8be501edc8ba8de2b318b103398b61b3c6aa6570cc891533088b72';
const nodeUrl = process.env.STARKNET_RPC_URL;
if (!nodeUrl) {
  console.error('STARKNET_RPC_URL is not set');
  process.exit(1);
}

try {
  const provider = new RpcProvider({ nodeUrl });
  console.log('RPC spec version:', await provider.getSpecVersion());
  const { abi } = await provider.getClassAt(contractAddress);
  const contract = new Contract(abi, contractAddress, provider);
  console.log('Contract loaded, get_file_count =', (await contract.get_file_count()).toString());
  console.log('OK');
} catch (error) {
  console.error('RPC check failed:', error.message);
  process.exit(1);
}
