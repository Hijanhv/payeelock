import {
  createPublicClient,
  createWalletClient,
  formatUnits,
  hashTypedData,
  http,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { mnemonicToAccount } from 'viem/accounts';
import { foundry } from 'viem/chains';
import { payeeLockAbi } from '../generated/payeelock.abi';
import { testResolverAbi } from '../generated/test-resolver.abi';
import { testUSDAbi } from '../generated/test-usd.abi';
import {
  domain,
  invoiceListHash,
  migrationTypes,
  paymentTypes,
  type Migration,
  type Payment,
} from './typed-data';
import type { Activity, WorkspaceAction, WorkspaceState } from './types';

const mnemonic = 'test test test test test test test test test test test junk';

export type AnvilManifest = {
  version: 1;
  chainId: 31337;
  rpcUrl: string;
  deploymentId: string;
  contract: Address;
  token: Address;
  resolver: Address;
  supplierId: Hex;
  node: Hex;
  actors: {
    buyer: Address;
    recovery: Address;
    executor: Address;
    oldBeneficiary: Address;
    newBeneficiary: Address;
    guardian: Address;
    attacker: Address;
  };
  invoices: Array<{
    id: Hex;
    label: string;
    description: string;
    due: string;
  }>;
  oldPayment: Record<string, string>;
  oldSignature: Hex;
  snapshotId: string;
};

type StoredProposal = {
  message: Record<string, string>;
  signature: Hex;
  ids: Hex[];
  digest: Hex;
};

export type AnvilSession = {
  deploymentId: string;
  snapshotId: string;
  activity: Activity[];
  proposal?: StoredProposal;
  lastPayment?: Record<string, string>;
  lastPaymentSignature?: Hex;
};

export type AnvilSessionStore = {
  load(deploymentId: string): AnvilSession | undefined;
  save(session: AnvilSession): void;
};

const paymentFrom = (p: Record<string, string>): Payment => ({
  invoiceId: p.invoiceId as Hex,
  beneficiary: p.beneficiary as Address,
  amount: BigInt(p.amount),
  epoch: BigInt(p.epoch),
  nonce: BigInt(p.nonce),
  deadline: BigInt(p.deadline),
});

const migrationFrom = (m: Record<string, string>): Migration => ({
  supplierId: m.supplierId as Hex,
  beneficiary: m.beneficiary as Address,
  invoiceIdsHash: m.invoiceIdsHash as Hex,
  fromEpoch: BigInt(m.fromEpoch),
  toEpoch: BigInt(m.toEpoch),
  nonce: BigInt(m.nonce),
  deadline: BigInt(m.deadline),
});

const json = (value: unknown) =>
  JSON.stringify(value, (_, item) => (typeof item === 'bigint' ? item.toString() : item));

/**
 * Direct Anvil proof shared by the browser and the CLI acceptance test.
 * There is deliberately no app API or server signer in this path. The mnemonic is
 * Anvil's public test mnemonic and the controller refuses every non-loopback RPC.
 */
export function createAnvilProof(manifest: AnvilManifest, store: AnvilSessionStore) {
  const rpc = new URL(manifest.rpcUrl);
  if (
    manifest.chainId !== 31337 ||
    rpc.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(rpc.hostname)
  ) {
    throw new Error('The Anvil test controller only connects to a loopback address.');
  }

  const publicClient = createPublicClient({
    chain: foundry,
    transport: http(manifest.rpcUrl, { retryCount: 0, timeout: 5_000 }),
    pollingInterval: 100,
  });
  const wallets = Array.from({ length: 7 }, (_, index) =>
    createWalletClient({
      account: mnemonicToAccount(mnemonic, { addressIndex: index }),
      chain: foundry,
      transport: http(manifest.rpcUrl, { retryCount: 0, timeout: 5_000 }),
    }),
  );

  function session() {
    return (
      store.load(manifest.deploymentId) || {
        deploymentId: manifest.deploymentId,
        snapshotId: manifest.snapshotId,
        activity: [],
      }
    );
  }

  async function assertChain() {
    if ((await publicClient.getChainId()) !== manifest.chainId)
      throw new Error('The Anvil test controller refuses non-Anvil chain IDs.');
    if ((await publicClient.getCode({ address: manifest.contract })) === '0x')
      throw new Error(
        'The Anvil test deployment is no longer available. Restart the acceptance test.',
      );
  }

  async function submit(
    current: AnvilSession,
    actor: number,
    target: Address,
    abi: Abi,
    functionName: string,
    args: readonly unknown[],
    title: string,
    detail: string,
    expectRevert = false,
  ) {
    let reason = 'The contract rejected this transaction.';
    if (expectRevert) {
      try {
        await publicClient.simulateContract({
          address: target,
          abi,
          functionName,
          args,
          account: wallets[actor].account,
        });
      } catch (error) {
        reason = (error as { shortMessage?: string }).shortMessage || reason;
      }
    }
    const hash = await wallets[actor].writeContract({
      address: target,
      abi,
      functionName,
      args,
      gas: 1_500_000n,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    const failed = receipt.status === 'reverted';
    if (!expectRevert && failed) throw new Error(`${title} reverted on Anvil (${hash}).`);
    if (expectRevert && !failed)
      throw new Error(`Security check unexpectedly succeeded (${hash}).`);
    current.activity.unshift({
      id: hash,
      title,
      detail: failed ? `${detail} ${reason}` : detail,
      time: new Date().toISOString(),
      kind: failed ? 'blocked' : 'success',
      hash,
      block: receipt.blockNumber.toString(),
    });
    store.save(current);
    return receipt;
  }

  async function getState(): Promise<WorkspaceState> {
    await assertChain();
    const current = session();
    const supplier = await publicClient.readContract({
      address: manifest.contract,
      abi: payeeLockAbi,
      functionName: 'suppliers',
      args: [manifest.supplierId],
    });
    const invoices = await Promise.all(
      manifest.invoices.map(async (entry) => {
        const invoice = await publicClient.readContract({
          address: manifest.contract,
          abi: payeeLockAbi,
          functionName: 'invoices',
          args: [entry.id],
        });
        return {
          ...entry,
          total: formatUnits(invoice[1], 6),
          paid: formatUnits(invoice[2], 6),
          remaining: formatUnits(invoice[1] - invoice[2], 6),
          beneficiary: invoice[3],
          epoch: Number(invoice[4]),
          nonce: Number(invoice[5]),
          status: invoice[6]
            ? ('Cancelled' as const)
            : invoice[1] === invoice[2]
              ? ('Paid' as const)
              : supplier[5]
                ? ('Frozen' as const)
                : invoice[4] !== supplier[4]
                  ? ('Needs migration' as const)
                  : ('Ready' as const),
        };
      }),
    );
    const [oldBalance, newBalance, reserved, endpoint] = await Promise.all([
      publicClient.readContract({
        address: manifest.token,
        abi: testUSDAbi,
        functionName: 'balanceOf',
        args: [manifest.actors.oldBeneficiary],
      }),
      publicClient.readContract({
        address: manifest.token,
        abi: testUSDAbi,
        functionName: 'balanceOf',
        args: [manifest.actors.newBeneficiary],
      }),
      publicClient.readContract({
        address: manifest.contract,
        abi: payeeLockAbi,
        functionName: 'reserved',
      }),
      publicClient.readContract({
        address: manifest.resolver,
        abi: testResolverAbi,
        functionName: 'invoiceEndpoint',
        args: [manifest.node],
      }),
    ]);
    return {
      mode: 'anvil-test',
      chainId: manifest.chainId,
      contract: manifest.contract,
      token: manifest.token,
      resolver: manifest.resolver,
      buyer: manifest.actors.buyer,
      oldBeneficiary: manifest.actors.oldBeneficiary,
      newBeneficiary: manifest.actors.newBeneficiary,
      recoverySigner: manifest.actors.recovery,
      guardian: manifest.actors.guardian,
      supplier: {
        id: manifest.supplierId,
        name: 'Harbor Systems',
        node: manifest.node,
        epoch: Number(supplier[4]),
        frozen: supplier[5],
        beneficiary: supplier[0],
        endpoint,
      },
      invoices,
      protected: formatUnits(reserved, 6),
      paid: invoices.reduce((sum, invoice) => sum + Number(invoice.paid), 0).toString(),
      oldBalance: formatUnits(oldBalance, 6),
      newBalance: formatUnits(newBalance, 6),
      proposal: current.proposal
        ? {
            invoiceIds: current.proposal.ids,
            fromEpoch: Number(current.proposal.message.fromEpoch),
            toEpoch: Number(current.proposal.message.toEpoch),
            beneficiary: current.proposal.message.beneficiary,
            digest: current.proposal.digest,
            signature: current.proposal.signature,
            expiresAt: Number(current.proposal.message.deadline),
          }
        : null,
      activity: current.activity,
    };
  }

  async function act(action: WorkspaceAction, invoiceId?: string): Promise<WorkspaceState> {
    await assertChain();
    const current = session();
    if (action === 'reset') {
      const reverted = await (
        publicClient.request as unknown as (request: {
          method: string;
          params: unknown[];
        }) => Promise<boolean>
      )({ method: 'evm_revert', params: [current.snapshotId] });
      if (!reverted)
        throw new Error('The saved Anvil snapshot expired. Restart the acceptance test.');
      const snapshotId = await (
        publicClient.request as unknown as (request: {
          method: string;
          params: unknown[];
        }) => Promise<string>
      )({ method: 'evm_snapshot', params: [] });
      store.save({
        deploymentId: manifest.deploymentId,
        snapshotId,
        activity: [],
      });
      return getState();
    }

    if (action === 'freeze') {
      await submit(
        current,
        5,
        manifest.contract,
        payeeLockAbi,
        'freeze',
        [manifest.supplierId],
        'Supplier payments frozen',
        'The recovery monitor used its freeze-only Privy guardian. Queued jobs now revert.',
      );
    } else if (action === 'attack') {
      await submit(
        current,
        2,
        manifest.resolver,
        testResolverAbi,
        'setAddr',
        [manifest.node, manifest.actors.attacker],
        'Address-redirection attack blocked',
        'The invoice publisher does not hold the beneficiary-write role.',
        true,
      );
    } else if (action === 'publish') {
      await submit(
        current,
        2,
        manifest.resolver,
        testResolverAbi,
        'setInvoiceEndpoint',
        [manifest.node, 'https://harbor.example/invoices/v2'],
        'Invoice endpoint updated',
        'Publishing permission works independently of beneficiary authority.',
      );
    } else if (action === 'replay') {
      const state = await getState();
      if (!state.supplier.frozen && state.supplier.epoch === 0)
        throw new Error('Freeze payments before submitting the queued authorization.');
      await submit(
        current,
        2,
        manifest.contract,
        payeeLockAbi,
        'pay',
        [paymentFrom(manifest.oldPayment), manifest.oldSignature],
        'Queued authorization rejected',
        'A previously valid signed payment was actually submitted onchain.',
        true,
      );
    } else if (action === 'duplicate') {
      if (!current.lastPayment || !current.lastPaymentSignature)
        throw new Error('Settle an invoice before testing duplicate execution.');
      await submit(
        current,
        2,
        manifest.contract,
        payeeLockAbi,
        'pay',
        [paymentFrom(current.lastPayment), current.lastPaymentSignature],
        'Duplicate payment rejected',
        'The exact signed payment was submitted a second time after settlement.',
        true,
      );
    } else if (action === 'propose') {
      const state = await getState();
      if (!state.supplier.frozen)
        throw new Error('Freeze supplier payments before preparing recovery.');
      const pending = state.invoices
        .filter((invoice) => invoice.status !== 'Paid' && invoice.status !== 'Cancelled')
        .map((invoice) => invoice.id as Hex);
      const nonce = await publicClient.readContract({
        address: manifest.contract,
        abi: payeeLockAbi,
        functionName: 'migrationNonces',
        args: [manifest.supplierId],
      });
      const message: Migration = {
        supplierId: manifest.supplierId,
        fromEpoch: BigInt(state.supplier.epoch),
        toEpoch: BigInt(state.supplier.epoch + 1),
        beneficiary: manifest.actors.newBeneficiary,
        invoiceIdsHash: invoiceListHash(pending),
        nonce,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 3_600),
      };
      const typed = {
        domain: domain(manifest.chainId, manifest.contract),
        types: migrationTypes,
        primaryType: 'Migration' as const,
        message,
      };
      current.proposal = {
        message: JSON.parse(json(message)),
        signature: await wallets[1].signTypedData(typed),
        ids: pending,
        digest: hashTypedData(typed),
      };
      current.activity.unshift({
        id: crypto.randomUUID(),
        title: 'Recovery proposal signed',
        detail:
          'The recovery signer authorized the exact unpaid invoice list and replacement wallet.',
        time: new Date().toISOString(),
        kind: 'info',
      });
      store.save(current);
    } else if (action === 'migrate') {
      if (!current.proposal) throw new Error('Get the supplier recovery signature first.');
      await submit(
        current,
        1,
        manifest.resolver,
        testResolverAbi,
        'setAddr',
        [manifest.node, manifest.actors.newBeneficiary],
        'Supplier beneficiary record updated',
        'The treasury signer updated the pinned resolver; payments remain frozen.',
      );
      await submit(
        current,
        0,
        manifest.contract,
        payeeLockAbi,
        'migrate',
        [migrationFrom(current.proposal.message), current.proposal.ids, current.proposal.signature],
        'Buyer accepted recovery',
        'Unpaid obligations moved to the new epoch; paid amounts stayed unchanged.',
      );
      delete current.proposal;
      store.save(current);
    } else if (action === 'pay') {
      if (!invoiceId || !manifest.invoices.some((invoice) => invoice.id === invoiceId))
        throw new Error('Select a known invoice.');
      const invoice = await publicClient.readContract({
        address: manifest.contract,
        abi: payeeLockAbi,
        functionName: 'invoices',
        args: [invoiceId as Hex],
      });
      const payment: Payment = {
        invoiceId: invoiceId as Hex,
        amount: invoice[1] - invoice[2],
        beneficiary: invoice[3],
        epoch: invoice[4],
        nonce: invoice[5],
        deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
      };
      const signature = await wallets[0].signTypedData({
        domain: domain(manifest.chainId, manifest.contract),
        types: paymentTypes,
        primaryType: 'Payment',
        message: payment,
      });
      await submit(
        current,
        2,
        manifest.contract,
        payeeLockAbi,
        'pay',
        [payment, signature],
        'Invoice remainder paid',
        `${formatUnits(payment.amount, 6)} dUSD transferred to the accepted beneficiary.`,
      );
      current.lastPayment = JSON.parse(json(payment));
      current.lastPaymentSignature = signature;
      store.save(current);
    }
    return getState();
  }

  return { getState, act };
}
