import { PrivyClient } from '@privy-io/node';
import {
  createPublicClient,
  encodeFunctionData,
  http,
  isAddressEqual,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';
import { payeeLockAbi } from '@payeelock/contracts/payeelock-abi';

type GraphResponse = {
  data?: {
    supplier?: {
      id: string;
      node: string;
      beneficiary: string;
      frozen: boolean;
      epoch: string;
    };
    ensActivities: Array<{
      id: string;
      kind: string;
      node?: string;
      account?: string;
      oldRoles?: string;
      newRoles?: string;
      addressValue?: string;
      transaction: string;
      actor: string;
      block: string;
    }>;
  };
  errors?: Array<{ message: string }>;
};

type Evidence = {
  condition: 'resolver_mismatch' | 'dangerous_role_grant';
  supplierId: Hex;
  transaction?: Hex;
  reason: string;
};

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Set ${name}.`);
  return value;
};

const supplierId = (process.env.RECOVERY_MONITOR_SUPPLIER_ID ||
  keccak256(stringToHex('harbor-systems'))) as Hex;
const contract = required('NEXT_PUBLIC_PAYEELOCK_ADDRESS') as Address;
const resolver = required('SEPOLIA_ENS_RESOLVER_ADDRESS') as Address;
const node = required('SEPOLIA_ENS_NODE').toLowerCase();
const rpcUrl = required('SEPOLIA_RPC_URL');
const mode = process.argv.includes('--execute') ? 'execute' : 'inspect';
const publicClient = createPublicClient({ chain: sepolia, transport: http(rpcUrl) });

async function graphSnapshot() {
  const endpoint = required('THE_GRAPH_QUERY_URL');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      query: `
        query RecoveryMonitorEvidence($supplier: Bytes!) {
          supplier(id: $supplier) { id node beneficiary frozen epoch }
          ensActivities(
            first: 30
            orderBy: block
            orderDirection: desc
          ) {
            id kind node account oldRoles newRoles addressValue transaction actor block
          }
        }
      `,
      variables: { supplier: supplierId.toLowerCase() },
    }),
  });
  if (!response.ok) throw new Error(`The Graph returned HTTP ${response.status}.`);
  const result = (await response.json()) as GraphResponse;
  if (result.errors?.length)
    throw new Error(result.errors.map((error) => error.message).join('; '));
  if (!result.data?.supplier) throw new Error('The indexed supplier was not found.');
  return result.data;
}

function roleEvidence(
  activities: GraphResponse['data'] extends infer T
    ? T extends { ensActivities: infer E }
      ? E
      : never
    : never,
): Evidence | undefined {
  const approved = new Set(
    (process.env.RECOVERY_MONITOR_APPROVED_ENS_ACTORS || '')
      .split(',')
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );
  for (const activity of activities) {
    if (activity.kind !== 'EACRolesChanged' || !activity.account) continue;
    const oldRoles = BigInt(activity.oldRoles || '0');
    const newRoles = BigInt(activity.newRoles || '0');
    const addedRoles = newRoles & ~oldRoles;
    if (addedRoles !== 0n && !approved.has(activity.account.toLowerCase())) {
      return {
        condition: 'dangerous_role_grant',
        supplierId,
        transaction: activity.transaction as Hex,
        reason: `ENS authority increased for unapproved account ${activity.account}.`,
      };
    }
  }
}

async function detect(): Promise<Evidence | undefined> {
  const [graph, supplier, currentBeneficiary] = await Promise.all([
    graphSnapshot(),
    publicClient.readContract({
      address: contract,
      abi: payeeLockAbi,
      functionName: 'suppliers',
      args: [supplierId],
    }),
    publicClient.readContract({
      address: resolver,
      abi: [
        {
          type: 'function',
          name: 'addr',
          stateMutability: 'view',
          inputs: [{ name: 'node', type: 'bytes32' }],
          outputs: [{ name: '', type: 'address' }],
        },
      ],
      functionName: 'addr',
      args: [node as Hex],
    }),
  ]);
  const pinnedBeneficiary = supplier[0] as Address;
  if (!isAddressEqual(pinnedBeneficiary, currentBeneficiary)) {
    const addressEvent = graph.ensActivities.find(
      (activity) =>
        activity.node?.toLowerCase() === node &&
        (activity.kind === 'AddrChanged' || activity.kind === 'AddressChanged'),
    );
    return {
      condition: 'resolver_mismatch',
      supplierId,
      transaction: addressEvent?.transaction as Hex | undefined,
      reason: `ENS now resolves to ${currentBeneficiary}, but PayeeLock still pins ${pinnedBeneficiary}.`,
    };
  }
  return roleEvidence(graph.ensActivities);
}

async function executeFreeze(evidence: Evidence) {
  const privy = new PrivyClient({
    appId: required('PRIVY_APP_ID'),
    appSecret: required('PRIVY_APP_SECRET'),
  });
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
    args: [evidence.supplierId],
  });
  const response = await privy
    .wallets()
    .ethereum()
    .sendTransaction(required('PRIVY_GUARDIAN_WALLET_ID'), {
      caip2: `eip155:${sepolia.id}`,
      params: { transaction: { to: contract, data, chain_id: sepolia.id } },
      authorization_context: {
        authorization_private_keys: [required('PRIVY_AUTHORIZATION_PRIVATE_KEY')],
      },
    });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: response.hash as Hex });
  return {
    transaction: response.hash,
    status: receipt.status,
    block: receipt.blockNumber.toString(),
  };
}

const evidence = await detect();
if (!evidence) {
  console.log(
    JSON.stringify(
      { decision: 'allow', reason: 'No deterministic freeze condition matched.' },
      null,
      2,
    ),
  );
} else if (mode === 'inspect') {
  console.log(JSON.stringify({ decision: 'freeze', mode, evidence }, null, 2));
} else {
  const execution = await executeFreeze(evidence);
  console.log(JSON.stringify({ decision: 'freeze', mode, evidence, execution }, null, 2));
}
