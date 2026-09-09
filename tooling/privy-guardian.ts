import { PrivyClient } from '@privy-io/node';
import {
  createPublicClient,
  encodeFunctionData,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}.`);
  return value;
};

const walletId = required('PRIVY_GUARDIAN_WALLET_ID');
const authorizationPrivateKey = required('PRIVY_AUTHORIZATION_PRIVATE_KEY');
const contract = required('NEXT_PUBLIC_PAYEELOCK_ADDRESS') as Address;
const guardian = required('SEPOLIA_GUARDIAN_ADDRESS') as Address;
const rpcUrl = required('SEPOLIA_RPC_URL');
const supplierId = (process.env.RECOVERY_MONITOR_SUPPLIER_ID ||
  keccak256(stringToHex('harbor-systems'))) as Hex;
const command = process.argv[2] || 'status';

const privy = new PrivyClient({
  appId: required('PRIVY_APP_ID'),
  appSecret: required('PRIVY_APP_SECRET'),
});
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });
const authorization_context = { authorization_private_keys: [authorizationPrivateKey] };

async function status() {
  const wallet = await privy.wallets().get(walletId);
  const [balance, configuredGuardian] = await Promise.all([
    publicClient.getBalance({ address: guardian }),
    publicClient.readContract({
      address: contract,
      abi: [
        {
          type: 'function',
          name: 'guardian',
          stateMutability: 'view',
          inputs: [],
          outputs: [{ name: '', type: 'address' }],
        },
      ],
      functionName: 'guardian',
    }),
  ]);
  console.log(
    JSON.stringify(
      {
        walletId: wallet.id,
        address: wallet.address,
        policyIds: wallet.policy_ids,
        balanceWei: balance.toString(),
        configuredGuardian,
        contract,
        chainId: sepolia.id,
      },
      null,
      2,
    ),
  );
}

async function attachPolicy() {
  const policyId = required('PRIVY_POLICY_ID');
  const wallet = await privy.wallets().update(walletId, {
    policy_ids: [policyId],
    authorization_context,
  });
  console.log(JSON.stringify({ walletId: wallet.id, policyIds: wallet.policy_ids }, null, 2));
}

async function denyProbe() {
  try {
    const response = await privy
      .wallets()
      .ethereum()
      .sendTransaction(walletId, {
        caip2: `eip155:${sepolia.id}`,
        params: {
          transaction: {
            to: required('SEPOLIA_NEW_BENEFICIARY_ADDRESS'),
            value: '0x1',
            chain_id: sepolia.id,
          },
        },
        authorization_context,
      });
    throw new Error(`Policy failure: transfer was broadcast as ${response.hash}.`);
  } catch (error) {
    const code =
      (error as { code?: string; error?: { code?: string } }).error?.code ||
      (error as { code?: string }).code;
    if (code !== 'policy_violation') throw error;
    console.log(JSON.stringify({ blocked: true, code, attemptedValueWei: '1' }, null, 2));
  }
}

async function freeze() {
  const data = encodeFunctionData({
    abi: [
      {
        type: 'function',
        name: 'freeze',
        stateMutability: 'nonpayable',
        inputs: [{ name: 'id', type: 'bytes32' }],
        outputs: [],
      },
    ],
    functionName: 'freeze',
    args: [supplierId],
  });
  const response = await privy
    .wallets()
    .ethereum()
    .sendTransaction(walletId, {
      caip2: `eip155:${sepolia.id}`,
      params: { transaction: { to: contract, data, chain_id: sepolia.id } },
      authorization_context,
    });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: response.hash as Hex });
  console.log(
    JSON.stringify(
      {
        supplierId,
        transaction: response.hash,
        status: receipt.status,
        block: receipt.blockNumber.toString(),
      },
      null,
      2,
    ),
  );
}

const commands: Record<string, () => Promise<void>> = {
  status,
  attach: attachPolicy,
  'deny-probe': denyProbe,
  freeze,
};

if (!commands[command]) {
  throw new Error('Use status, attach, deny-probe, or freeze.');
}

await commands[command]();
