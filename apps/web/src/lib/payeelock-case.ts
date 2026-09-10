import 'server-only';

import {
  createPublicClient,
  formatUnits,
  http,
  keccak256,
  stringToHex,
  type Address,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';
import { payeeLockAbi } from '@payeelock/contracts/payeelock-abi';
import proof from '../../../../deployments/sepolia-proof.json';

const contract = proof.contracts.payeeLock as Address;
const token = proof.contracts.mockUsdc as Address;
const oldBeneficiary = proof.actors.oldBeneficiary as Address;
const newBeneficiary = proof.actors.newBeneficiary as Address;
const supplierId = keccak256(stringToHex('harbor-systems'));

const tokenAbi = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

const invoiceDefinitions = [
  {
    label: 'BILL-4821',
    description: 'Cloud infrastructure · August',
  },
  {
    label: 'BILL-4822',
    description: 'Security monitoring · September',
  },
  {
    label: 'BILL-4823',
    description: 'Incident response retainer',
  },
].map((invoice) => ({ ...invoice, id: keccak256(stringToHex(invoice.label)) }));

export type CaseStep = {
  title: string;
  shortTitle: string;
  source: 'ENSv2' | 'Privy' | 'PayeeLock';
  body: string;
  outcome: string;
  transaction: Hex;
  block: number;
  state: 'safe' | 'warning' | 'blocked' | 'recovered';
};

export type GraphEvidence = {
  status: 'pending' | 'live' | 'unavailable';
  indexedBlock: number | null;
  deployment: string | null;
  supplierIndexed: boolean;
  invoiceCount: number;
  contractEventCount: number;
  ensEventCount: number;
  studioUrl: string;
  events: Array<{
    id: string;
    kind: string;
    source: string;
    amount: string | null;
    block: string;
    transaction: string;
  }>;
};

export type PayeeLockCase = {
  connected: boolean;
  contract: Address;
  newBeneficiary: Address;
  reserved: string;
  oldBalance: string;
  newBalance: string;
  graph: GraphEvidence;
  receipts: Array<{ hash: Hex; status: 'success' | 'reverted'; block: number }>;
  invoices: Array<{
    id: Hex;
    label: string;
    description: string;
    total: string;
  }>;
  steps: CaseStep[];
};

type GraphEvidenceResponse = {
  data?: {
    _meta?: {
      block?: { number?: number };
      deployment?: string;
      hasIndexingErrors?: boolean;
    };
    supplier?: { id: string };
    invoices?: Array<{ id: string }>;
    payeeLockEvents?: Array<{
      id: string;
      kind: string;
      amount: string | null;
      block: string;
      transaction: string;
    }>;
    ensActivities?: Array<{ id: string; kind: string; block: string; transaction: string }>;
  };
  errors?: Array<{ message: string }>;
};

function publicGraphStudioUrl() {
  const fallback = 'https://thegraph.com/studio/';
  const candidate = process.env.THE_GRAPH_STUDIO_URL;
  if (!candidate) return fallback;
  try {
    const url = new URL(candidate);
    return url.protocol === 'https:' && url.hostname === 'thegraph.com' ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

async function getGraphEvidence(): Promise<GraphEvidence> {
  const endpoint = process.env.THE_GRAPH_QUERY_URL;
  const empty = {
    indexedBlock: null,
    deployment: null,
    supplierIndexed: false,
    invoiceCount: 0,
    contractEventCount: 0,
    ensEventCount: 0,
    studioUrl: publicGraphStudioUrl(),
    events: [],
  };
  if (!endpoint) return { status: 'pending', ...empty };

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        query: `
          query SubmissionEvidence($supplier: Bytes!) {
            _meta { block { number } deployment hasIndexingErrors }
            supplier(id: $supplier) { id }
            invoices(first: 100) { id }
            payeeLockEvents(first: 100, orderBy: block, orderDirection: desc) { id kind amount block transaction }
            ensActivities(first: 100, orderBy: block, orderDirection: desc) { id kind block transaction }
          }
        `,
        variables: { supplier: supplierId.toLowerCase() },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) return { status: 'unavailable', ...empty };
    const result = (await response.json()) as GraphEvidenceResponse;
    if (
      result.errors?.length ||
      !result.data?._meta?.block?.number ||
      result.data._meta.hasIndexingErrors
    ) {
      return { status: 'unavailable', ...empty };
    }
    return {
      status: 'live',
      indexedBlock: Number(result.data._meta.block.number),
      deployment: result.data._meta.deployment || null,
      supplierIndexed: Boolean(result.data.supplier),
      invoiceCount: result.data.invoices?.length || 0,
      contractEventCount: result.data.payeeLockEvents?.length || 0,
      ensEventCount: result.data.ensActivities?.length || 0,
      studioUrl: empty.studioUrl,
      events: [
        ...(result.data.payeeLockEvents || []).map((event) => ({
          ...event,
          source: 'PayeeLock',
          amount:
            event.kind === 'InvoicePaid' && event.amount !== null
              ? formatUnits(BigInt(event.amount), 6)
              : null,
        })),
        ...(result.data.ensActivities || []).map((event) => ({
          ...event,
          source: 'ENS',
          amount: null,
        })),
      ].sort((a, b) => Number(b.block) - Number(a.block)),
    };
  } catch {
    return { status: 'unavailable', ...empty };
  }
}

const steps: CaseStep[] = [
  {
    shortTitle: 'Funded',
    title: 'Meridian locks three approved invoices',
    source: 'PayeeLock',
    body: '14,000 MockUSDC enters the vault before any payment can run. Each invoice pins Harbor’s current ENS beneficiary.',
    outcome: 'Funds are committed, but cannot leave through an unapproved route.',
    transaction: proof.transactions.invoiceApprovalThree as Hex,
    block: 11685191,
    state: 'safe',
  },
  {
    shortTitle: 'Paid once',
    title: 'A normal installment reaches Harbor',
    source: 'PayeeLock',
    body: 'Meridian signs a beneficiary-, epoch-, nonce-, contract-, and chain-bound payment for 2,400 MockUSDC.',
    outcome: 'Paid history is final. The remaining 11,600 stays protected.',
    transaction: proof.transactions.legitimatePartialPayment as Hex,
    block: 11685194,
    state: 'safe',
  },
  {
    shortTitle: 'Permission test',
    title: 'The publishing key cannot redirect payment',
    source: 'ENSv2',
    body: 'Harbor’s publishing key can update one invoice text record. Its attempt to change the payout address reverts because ENSv2 never granted that permission.',
    outcome: 'The payout record does not move and the failed transaction stays public.',
    transaction: proof.transactions.publisherRedirectRejected as Hex,
    block: 11685123,
    state: 'warning',
  },
  {
    shortTitle: 'Frozen',
    title: 'The Privy guardian pauses payments',
    source: 'Privy',
    body: 'The guardian submits freeze(harbor-systems). Privy allows this exact function on this exact Sepolia contract and denies every unmatched action.',
    outcome: 'Payments stop. The guardian cannot move funds or choose a replacement wallet.',
    transaction: proof.transactions.privyGuardianFreeze as Hex,
    block: 11685198,
    state: 'blocked',
  },
  {
    shortTitle: 'Recovered',
    title: 'Harbor and Meridian approve the same recovery',
    source: 'PayeeLock',
    body: 'Harbor signs the replacement wallet and the exact three-invoice set. Meridian accepts that typed proposal onchain.',
    outcome: 'The epoch advances, paid history stays intact, and every invoice nonce changes.',
    transaction: proof.transactions.invoiceMigration as Hex,
    block: 11685210,
    state: 'recovered',
  },
  {
    shortTitle: 'Old job blocked',
    title: 'The queued payment cannot follow the old route',
    source: 'PayeeLock',
    body: 'The old instruction still names epoch zero, nonce zero, and Harbor’s previous wallet. It is deliberately broadcast after recovery.',
    outcome: 'The transaction reverts on Sepolia. No balance changes.',
    transaction: proof.transactions.oldPaymentRejectedAfterRecovery as Hex,
    block: 11685211,
    state: 'blocked',
  },
  {
    shortTitle: 'Settled',
    title: 'Only the unpaid remainder reaches the new wallet',
    source: 'PayeeLock',
    body: 'Fresh authorizations settle all three remainders against epoch one and their new nonces.',
    outcome: '11,600 MockUSDC reaches the recovered wallet. Vault reserve: zero.',
    transaction: proof.transactions.settlementThree as Hex,
    block: 11685217,
    state: 'recovered',
  },
];

export async function getPayeeLockCase(): Promise<PayeeLockCase> {
  const publicClient = createPublicClient({
    chain: sepolia,
    transport: http(process.env.SEPOLIA_RPC_URL, { timeout: 8_000, retryCount: 0 }),
  });
  const [graph, receiptResults] = await Promise.all([
    getGraphEvidence(),
    Promise.allSettled(
      steps.map((step) => publicClient.getTransactionReceipt({ hash: step.transaction })),
    ),
  ]);
  const receipts = receiptResults.flatMap((result) =>
    result.status === 'fulfilled'
      ? [
          {
            hash: result.value.transactionHash,
            status: result.value.status,
            block: Number(result.value.blockNumber),
          },
        ]
      : [],
  );

  try {
    const [reserved, oldBalance, newBalance, ...invoices] = await Promise.all([
      publicClient.readContract({ address: contract, abi: payeeLockAbi, functionName: 'reserved' }),
      publicClient.readContract({
        address: token,
        abi: tokenAbi,
        functionName: 'balanceOf',
        args: [oldBeneficiary],
      }),
      publicClient.readContract({
        address: token,
        abi: tokenAbi,
        functionName: 'balanceOf',
        args: [newBeneficiary],
      }),
      ...invoiceDefinitions.map((invoice) =>
        publicClient.readContract({
          address: contract,
          abi: payeeLockAbi,
          functionName: 'invoices',
          args: [invoice.id],
        }),
      ),
    ]);

    return {
      connected: true,
      contract,
      newBeneficiary,
      reserved: formatUnits(reserved as bigint, 6),
      oldBalance: formatUnits(oldBalance as bigint, 6),
      newBalance: formatUnits(newBalance as bigint, 6),
      graph,
      receipts,
      invoices: invoiceDefinitions.map((definition, index) => {
        const invoice = invoices[index] as readonly unknown[];
        const total = invoice[1] as bigint;
        return {
          ...definition,
          total: formatUnits(total, 6),
        };
      }),
      steps,
    };
  } catch {
    return {
      connected: false,
      contract,
      newBeneficiary,
      reserved: proof.finalState.vaultReservedMockUsdc,
      oldBalance: proof.finalState.oldBeneficiaryMockUsdc,
      newBalance: proof.finalState.newBeneficiaryMockUsdc,
      graph,
      receipts,
      invoices: invoiceDefinitions.map((definition, index) => ({
        ...definition,
        total: ['6800', '4800', '2400'][index],
      })),
      steps,
    };
  }
}
