import { readFile, writeFile, mkdir } from 'node:fs/promises';
import {
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  type Hex,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';

// Deliberately has no default signer and never uses Anvil credentials.
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before deploying.`);
  return value;
};
const checkedAddress = (name: string): Address => {
  const value = required(name);
  if (!isAddress(value)) throw new Error(`${name} must be an Ethereum address.`);
  return value;
};
async function main() {
  const key = required('SEPOLIA_DEPLOYER_PRIVATE_KEY');
  if (!/^0x[\da-fA-F]{64}$/.test(key))
    throw new Error('Deployer key must be a 32-byte hex private key.');
  const buyer = checkedAddress('SEPOLIA_BUYER_ADDRESS');
  const executor = checkedAddress('SEPOLIA_EXECUTOR_ADDRESS');
  const guardian = checkedAddress('SEPOLIA_GUARDIAN_ADDRESS');
  const asset = checkedAddress('SEPOLIA_ASSET_ADDRESS');
  const transport = http(required('SEPOLIA_RPC_URL'));
  const publicClient = createPublicClient({ chain: sepolia, transport });
  if ((await publicClient.getChainId()) !== sepolia.id)
    throw new Error('Deployment is restricted to Sepolia chain 11155111.');
  if (!(await publicClient.getCode({ address: asset })))
    throw new Error('Asset must be an existing ERC20 contract.');
  const wallet = createWalletClient({
    account: privateKeyToAccount(key as Hex),
    chain: sepolia,
    transport,
  });
  const artifact = JSON.parse(
    await readFile('packages/contracts/out/PayeeLock.sol/PayeeLock.json', 'utf8'),
  );
  console.log('Deploying PayeeLock to Sepolia', {
    buyer,
    executor,
    guardian,
    asset,
    deployer: wallet.account.address,
  });
  const hash = await wallet.deployContract({
    abi: artifact.abi,
    bytecode: artifact.bytecode.object,
    args: [asset, buyer, executor, guardian],
  });
  console.log('Deployment transaction:', hash);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success' || !receipt.contractAddress)
    throw new Error('Deployment reverted.');
  await mkdir('deployments', { recursive: true });
  await writeFile(
    `deployments/sepolia-${receipt.contractAddress}.json`,
    JSON.stringify(
      {
        chainId: sepolia.id,
        address: receipt.contractAddress,
        asset,
        buyer,
        executor,
        guardian,
        hash,
        block: receipt.blockNumber.toString(),
      },
      null,
      2,
    ),
  );
  console.log(`NEXT_PUBLIC_PAYEELOCK_ADDRESS=${receipt.contractAddress}`);
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : 'Deployment failed');
  process.exitCode = 1;
});
