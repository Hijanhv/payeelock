import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, http, type Hex } from 'viem';
import { sepolia } from 'viem/chains';
import { loadKeystoreAccount } from './keystore-account';

// Deploys the shared entry points that let anyone create a buyer-owned vault.
const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name} before deploying.`);
  return value;
};

async function artifact(source: string, name: string) {
  return JSON.parse(await readFile(`packages/contracts/out/${source}/${name}.json`, 'utf8')) as {
    abi: readonly unknown[];
    bytecode: { object: Hex };
  };
}

async function main() {
  const transport = http(required('SEPOLIA_RPC_URL'));
  const publicClient = createPublicClient({ chain: sepolia, transport });
  if ((await publicClient.getChainId()) !== sepolia.id) {
    throw new Error('Deployment is restricted to Sepolia chain 11155111.');
  }

  const account = await loadKeystoreAccount(
    required('SEPOLIA_DEPLOYER_KEYSTORE'),
    required('SEPOLIA_KEYSTORE_PASSWORD'),
  );
  const wallet = createWalletClient({ account, chain: sepolia, transport });
  console.log('Deploying workspace entry points from', account.address);

  const token = await artifact('TestFixtures.sol', 'TestUSD');
  const tokenHash = await wallet.deployContract({
    abi: token.abi,
    bytecode: token.bytecode.object,
    args: [account.address],
  });
  const tokenReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenHash });
  if (tokenReceipt.status !== 'success' || !tokenReceipt.contractAddress) {
    throw new Error('Faucet token deployment reverted.');
  }

  const factory = await artifact('PayeeLockFactory.sol', 'PayeeLockFactory');
  const factoryHash = await wallet.deployContract({
    abi: factory.abi,
    bytecode: factory.bytecode.object,
    args: [],
  });
  const factoryReceipt = await publicClient.waitForTransactionReceipt({ hash: factoryHash });
  if (factoryReceipt.status !== 'success' || !factoryReceipt.contractAddress) {
    throw new Error('Factory deployment reverted.');
  }

  await mkdir('deployments', { recursive: true });
  await writeFile(
    'deployments/workspace.json',
    `${JSON.stringify(
      {
        network: 'Ethereum Sepolia',
        chainId: sepolia.id,
        factory: factoryReceipt.contractAddress,
        testToken: tokenReceipt.contractAddress,
        deployer: account.address,
        verifiedAtBlock: Number(factoryReceipt.blockNumber),
        transactions: {
          testTokenDeployment: tokenHash,
          factoryDeployment: factoryHash,
        },
      },
      null,
      2,
    )}\n`,
  );

  console.log('Factory:', factoryReceipt.contractAddress);
  console.log('Test token:', tokenReceipt.contractAddress);
  console.log(`NEXT_PUBLIC_PAYEELOCK_FACTORY=${factoryReceipt.contractAddress}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Deployment failed');
  process.exitCode = 1;
});
