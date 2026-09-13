import { spawn } from 'node:child_process';
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  parseUnits,
  stringToHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { payeeLockAbi } from '@payeelock/contracts/payeelock-abi';
import { payeeLockBytecode } from '@payeelock/contracts/payeelock-bytecode';
import { workspaceResolverAbi } from '@payeelock/contracts/workspace-resolver-abi';
import { workspaceResolverBytecode } from '@payeelock/contracts/workspace-resolver-bytecode';
import { testUSDAbi } from '@payeelock/contracts/test-usd-abi';
import { testUSDBytecode } from '@payeelock/contracts/test-usd-bytecode';

// Replays the browser workspace sequence against a local chain using the same
// committed bytecode, ABIs, and EIP-712 types the page ships.
const RPC = 'http://127.0.0.1:8547';
const KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const PORT = 8547;

const chain = { ...foundry, id: 31337, rpcUrls: { default: { http: [RPC] } } };

function waitForRpc(): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + 20_000;
    const poll = async () => {
      try {
        await fetch(RPC, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
        });
        resolve();
      } catch {
        if (Date.now() > deadline) reject(new Error('Anvil did not start.'));
        else setTimeout(poll, 250);
      }
    };
    void poll();
  });
}

const paymentTypes = {
  Payment: [
    { name: 'invoiceId', type: 'bytes32' },
    { name: 'amount', type: 'uint256' },
    { name: 'beneficiary', type: 'address' },
    { name: 'epoch', type: 'uint64' },
    { name: 'nonce', type: 'uint64' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

const migrationTypes = {
  Migration: [
    { name: 'supplierId', type: 'bytes32' },
    { name: 'fromEpoch', type: 'uint64' },
    { name: 'toEpoch', type: 'uint64' },
    { name: 'beneficiary', type: 'address' },
    { name: 'invoiceIdsHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

async function main() {
  const anvil = spawn('anvil', ['--port', String(PORT), '--silent'], { stdio: 'ignore' });
  const stop = () => anvil.kill('SIGTERM');
  process.on('exit', stop);

  const account = privateKeyToAccount(KEY);
  const transport = http(RPC);
  const publicClient = createPublicClient({ chain, transport });
  const wallet = createWalletClient({ account, chain, transport });
  await waitForRpc();

  const checks: string[] = [];
  const assert = (condition: boolean, label: string) => {
    if (!condition) throw new Error('FAILED: ' + label);
    checks.push(label);
  };

  const deploy = async (
    abi: readonly unknown[],
    bytecode: `0x${string}`,
    args: readonly unknown[],
  ) => {
    const hash = await wallet.deployContract({ abi, bytecode, args, account, chain });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) throw new Error('Deployment failed.');
    return receipt.contractAddress;
  };

  // Exactly the three deployments the browser performs.
  const token = await deploy(testUSDAbi, testUSDBytecode as `0x${string}`, [account.address]);
  const resolver = await deploy(
    workspaceResolverAbi as never,
    workspaceResolverBytecode as `0x${string}`,
    [account.address, account.address],
  );
  const vault = await deploy(payeeLockAbi as never, payeeLockBytecode as `0x${string}`, [
    token,
    account.address,
    account.address,
    account.address,
  ]);
  assert(
    Boolean(token && resolver && vault),
    'browser deploy sequence produces token, resolver, and vault',
  );

  const buyer = await publicClient.readContract({
    address: vault,
    abi: payeeLockAbi,
    functionName: 'BUYER',
  });
  assert(buyer.toLowerCase() === account.address.toLowerCase(), 'creator is the vault buyer');

  const supplierId = keccak256(stringToHex('acme-cloud'));
  const node = keccak256(stringToHex('acme.workspace'));
  const invoiceId = keccak256(stringToHex('INV-1001'));
  // The supplier's payout wallet is a different party than the buyer.
  const payout = '0x90F79bf6EB2c4f870365E785982E1f101E93b906' as const;
  const replacement = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC' as const;

  const write = async (
    address: `0x${string}`,
    abi: readonly unknown[],
    functionName: string,
    args: readonly unknown[],
  ) => {
    const hash = await wallet.writeContract({
      address,
      abi: abi as never,
      functionName,
      args,
      account,
      chain,
    });
    await publicClient.waitForTransactionReceipt({ hash });
  };

  await write(resolver, workspaceResolverAbi, 'setAddr', [node, payout]);
  await write(vault, payeeLockAbi, 'registerSupplier', [
    supplierId,
    payout,
    account.address,
    resolver,
    node,
  ]);
  await write(token, testUSDAbi, 'mint', [account.address, parseUnits('5000', 6)]);
  await write(token, testUSDAbi, 'approve', [vault, parseUnits('2500', 6)]);
  await write(vault, payeeLockAbi, 'approveInvoice', [
    invoiceId,
    supplierId,
    parseUnits('2500', 6),
  ]);
  assert(
    (await publicClient.readContract({
      address: vault,
      abi: payeeLockAbi,
      functionName: 'reserved',
    })) === parseUnits('2500', 6),
    'invoice prefunded into the vault',
  );

  const domain = {
    name: 'PayeeLock',
    version: '1',
    chainId: chain.id,
    verifyingContract: vault,
  } as const;

  const pay = async (amount: string) => {
    const record = (await publicClient.readContract({
      address: vault,
      abi: payeeLockAbi,
      functionName: 'invoices',
      args: [invoiceId],
    })) as unknown as readonly [string, bigint, bigint, string, bigint, bigint, boolean];
    const message = {
      invoiceId,
      amount: parseUnits(amount, 6),
      beneficiary: record[3] as `0x${string}`,
      epoch: record[4],
      nonce: record[5],
      deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
    };
    const signature = await wallet.signTypedData({
      account,
      domain,
      types: paymentTypes,
      primaryType: 'Payment',
      message,
    });
    await write(vault, payeeLockAbi, 'pay', [message, signature]);
  };

  await pay('1000');
  assert(
    (await publicClient.readContract({
      address: token,
      abi: testUSDAbi,
      functionName: 'balanceOf',
      args: [payout],
    })) === parseUnits('1000', 6),
    'first payment settles to the payout wallet',
  );

  await write(vault, payeeLockAbi, 'freeze', [supplierId]);
  assert(
    (
      await publicClient.readContract({
        address: vault,
        abi: payeeLockAbi,
        functionName: 'suppliers',
        args: [supplierId],
      })
    )[5] === true,
    'freeze pauses the supplier',
  );

  await write(resolver, workspaceResolverAbi, 'setAddr', [node, replacement]);
  const nonce = (await publicClient.readContract({
    address: vault,
    abi: payeeLockAbi,
    functionName: 'migrationNonces',
    args: [supplierId],
  })) as bigint;
  const ids = [invoiceId];
  const migration = {
    supplierId,
    fromEpoch: 0n,
    toEpoch: 1n,
    beneficiary: replacement,
    invoiceIdsHash: keccak256(encodeAbiParameters([{ type: 'bytes32[]' }], [ids])),
    nonce,
    deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
  };
  const migrationSig = await wallet.signTypedData({
    account,
    domain,
    types: migrationTypes,
    primaryType: 'Migration',
    message: migration,
  });
  await write(vault, payeeLockAbi, 'migrate', [migration, ids, migrationSig]);
  assert(
    (
      await publicClient.readContract({
        address: vault,
        abi: payeeLockAbi,
        functionName: 'suppliers',
        args: [supplierId],
      })
    )[4] === 1n,
    'buyer accepts recovery and epoch advances',
  );

  await pay('1500');
  assert(
    (await publicClient.readContract({
      address: token,
      abi: testUSDAbi,
      functionName: 'balanceOf',
      args: [replacement],
    })) === parseUnits('1500', 6),
    'remaining balance settles to the replacement wallet',
  );
  assert(
    (await publicClient.readContract({
      address: vault,
      abi: payeeLockAbi,
      functionName: 'reserved',
    })) === 0n,
    'vault reserve returns to zero',
  );

  console.log(checks.length + ' workspace browser-flow checks passed:');
  for (const check of checks) console.log('  - ' + check);
  stop();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Workspace smoke test failed.');
  process.exitCode = 1;
});
