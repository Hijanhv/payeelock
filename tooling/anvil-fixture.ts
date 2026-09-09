import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import {
  createPublicClient,
  createWalletClient,
  http,
  keccak256,
  namehash,
  stringToHex,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { payeeLockAbi } from '@payeelock/contracts/payeelock-abi';
import { testResolverAbi } from '@payeelock/contracts/test-resolver-abi';
import { testUSDAbi } from '@payeelock/contracts/test-usd-abi';
import { domain, paymentTypes, type Payment } from '@payeelock/contracts/test-support/typed-data';
import type { AnvilManifest } from '@payeelock/contracts/test-support/anvil-proof';

const mnemonic = 'test test test test test test test test test test test junk';
const entries = [
  {
    label: 'BILL-4821',
    description: 'Cloud infrastructure · August',
    total: 6_800,
    due: 'Sep 09, 2026',
  },
  {
    label: 'BILL-4822',
    description: 'Security monitoring · September',
    total: 4_800,
    due: 'Sep 11, 2026',
  },
  {
    label: 'BILL-4823',
    description: 'Incident response retainer',
    total: 2_400,
    due: 'Sep 14, 2026',
  },
];

export async function deployAnvilFixture(
  rpcUrl = 'http://127.0.0.1:8547',
  writeManifest = true,
): Promise<AnvilManifest> {
  const publicClient = createPublicClient({ chain: foundry, transport: http(rpcUrl) });
  if ((await publicClient.getChainId()) !== 31337)
    throw new Error('The Anvil fixture is restricted to test chain 31337.');
  const wallets = Array.from({ length: 7 }, (_, index) =>
    createWalletClient({
      account: mnemonicToAccount(mnemonic, { addressIndex: index }),
      chain: foundry,
      transport: http(rpcUrl),
    }),
  );
  const supplierId = keccak256(stringToHex('harbor-systems'));
  const node = namehash('harbor.payeelock.eth');
  const invoices = entries.map((entry) => ({
    ...entry,
    id: keccak256(stringToHex(entry.label)),
  }));

  async function deploy(name: string, source: string, args: readonly unknown[]) {
    const artifact = JSON.parse(
      await readFile(`packages/contracts/out/${source}/${name}.json`, 'utf8'),
    );
    const hash = await wallets[0].deployContract({
      abi: artifact.abi,
      bytecode: artifact.bytecode.object as Hex,
      args,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress || receipt.status !== 'success')
      throw new Error(`${name} deployment failed.`);
    return receipt.contractAddress;
  }

  async function send(
    actor: number,
    address: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
  ) {
    const hash = await wallets[actor].writeContract({ address, abi, functionName, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`${functionName} reverted while seeding.`);
    return receipt;
  }

  const token = await deploy('TestUSD', 'TestFixtures.sol', [wallets[0].account.address]);
  const resolver = await deploy('TestResolver', 'TestFixtures.sol', [
    wallets[1].account.address,
    wallets[2].account.address,
  ]);
  const contract = await deploy('PayeeLock', 'PayeeLock.sol', [
    token,
    wallets[0].account.address,
    wallets[2].account.address,
    wallets[5].account.address,
  ]);
  await send(1, resolver, testResolverAbi, 'setAddr', [node, wallets[3].account.address]);
  await send(0, contract, payeeLockAbi, 'registerSupplier', [
    supplierId,
    wallets[3].account.address,
    wallets[1].account.address,
    resolver,
    node,
  ]);
  await send(0, token, testUSDAbi, 'approve', [contract, 14_000n * 1_000_000n]);
  for (let index = 0; index < invoices.length; index++) {
    await send(0, contract, payeeLockAbi, 'approveInvoice', [
      invoices[index].id,
      supplierId,
      BigInt(entries[index].total) * 1_000_000n,
    ]);
  }
  const partial: Payment = {
    invoiceId: invoices[0].id,
    amount: 2_400n * 1_000_000n,
    beneficiary: wallets[3].account.address,
    epoch: 0n,
    nonce: 0n,
    deadline: BigInt(Math.floor(Date.now() / 1_000) + 86_400),
  };
  const partialSignature = await wallets[0].signTypedData({
    domain: domain(31337, contract),
    types: paymentTypes,
    primaryType: 'Payment',
    message: partial,
  });
  await send(2, contract, payeeLockAbi, 'pay', [partial, partialSignature]);
  const oldPayment = {
    ...partial,
    invoiceId: invoices[1].id,
    amount: 4_800n * 1_000_000n,
  };
  const oldSignature = await wallets[0].signTypedData({
    domain: domain(31337, contract),
    types: paymentTypes,
    primaryType: 'Payment',
    message: oldPayment,
  });
  const snapshotId = await (
    publicClient.request as unknown as (request: {
      method: string;
      params: unknown[];
    }) => Promise<string>
  )({ method: 'evm_snapshot', params: [] });
  const manifest: AnvilManifest = {
    version: 1,
    chainId: 31337,
    rpcUrl,
    deploymentId: randomUUID(),
    contract,
    token,
    resolver,
    supplierId,
    node,
    actors: {
      buyer: wallets[0].account.address,
      recovery: wallets[1].account.address,
      executor: wallets[2].account.address,
      oldBeneficiary: wallets[3].account.address,
      newBeneficiary: wallets[4].account.address,
      guardian: wallets[5].account.address,
      attacker: wallets[6].account.address,
    },
    invoices: invoices.map(({ id, label, description, due }) => ({ id, label, description, due })),
    oldPayment: JSON.parse(
      JSON.stringify(oldPayment, (_, item) => (typeof item === 'bigint' ? item.toString() : item)),
    ),
    oldSignature,
    snapshotId,
  };
  if (writeManifest) {
    await mkdir('.runtime', { recursive: true });
    await writeFile('.runtime/local-deployment.json', JSON.stringify(manifest, null, 2));
  }
  return manifest;
}
