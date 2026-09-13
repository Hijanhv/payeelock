'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  decodeEventLog,
  encodeAbiParameters,
  formatUnits,
  keccak256,
  parseUnits,
  stringToHex,
} from 'viem';
import { sepolia } from 'viem/chains';
import { payeeLockFactoryAbi } from '@payeelock/contracts/payee-lock-factory-abi';
import { payeeLockAbi } from '@payeelock/contracts/payeelock-abi';
import { payeeLockBytecode } from '@payeelock/contracts/payeelock-bytecode';
import { workspaceResolverAbi } from '@payeelock/contracts/workspace-resolver-abi';
import { workspaceResolverBytecode } from '@payeelock/contracts/workspace-resolver-bytecode';
import { testUSDAbi } from '@payeelock/contracts/test-usd-abi';
import { testUSDBytecode } from '@payeelock/contracts/test-usd-bytecode';
import { Icon } from '@/components/graphics/icons';
import {
  ensureSepolia,
  hasInjectedWallet,
  requestAccount,
  sepoliaClients,
  walletErrorMessage,
  watchWallet,
} from '@/lib/wallet-client';

type Address = `0x${string}`;

const erc20Abi = [
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [{ type: 'address' }, { type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [{ type: 'address' }, { type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
] as const;

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

const domain = (vault: Address) => ({
  name: 'PayeeLock',
  version: '1',
  chainId: sepolia.id,
  verifyingContract: vault,
});

const short = (value: string) => value.slice(0, 8) + '...' + value.slice(-6);
const isAddress = (value: string) => /^0x[0-9a-fA-F]{40}$/.test(value);

// The deployed factory creates a vault and its resolver in one transaction.
// Without it, the page falls back to deploying each contract directly.
const FACTORY = (process.env.NEXT_PUBLIC_PAYEELOCK_FACTORY ?? '') as Address | '';
const TEST_TOKEN = (process.env.NEXT_PUBLIC_PAYEELOCK_TEST_TOKEN ?? '') as Address | '';
const units = (value: bigint, decimals: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(
    Number(formatUnits(value, decimals)),
  );

type InvoiceRow = { id: Address; label: string; total: bigint; migrate: boolean };

type Loaded = {
  buyer: Address;
  token: Address;
  guardian: Address;
  reserved: bigint;
  symbol: string;
  decimals: number;
  balance: bigint;
  allowance: bigint;
  supplierExists: boolean;
  supplierEpoch: number;
  frozen: boolean;
  supplierBeneficiary: Address;
};

export function PayeeLockWorkspace() {
  const [account, setAccount] = useState<Address | null>(null);
  const [vault, setVault] = useState('');
  const [resolver, setResolver] = useState('');
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [supplierKey, setSupplierKey] = useState('acme-cloud');
  const [nodeName, setNodeName] = useState('acme.workspace');
  const [payout, setPayout] = useState('');
  const [newPayout, setNewPayout] = useState('');
  const [invoiceKey, setInvoiceKey] = useState('INV-1001');
  const [invoiceTotal, setInvoiceTotal] = useState('2500');
  const [payAmount, setPayAmount] = useState('1000');
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [selected, setSelected] = useState<Address | null>(null);
  const [status, setStatus] = useState({ kind: 'idle', message: '' });
  const [version, setVersion] = useState(0);
  const [walletAvailable, setWalletAvailable] = useState(true);

  const busy = status.kind === 'busy';
  const supplierId = keccak256(stringToHex(supplierKey || 'supplier'));
  const node = keccak256(stringToHex(nodeName || 'node'));
  const invoiceId = keccak256(stringToHex(invoiceKey || 'invoice'));

  // Keep the user's own vault reachable across visits.
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem('payeelock.workspace');
      if (!saved) return;
      const parsed = JSON.parse(saved) as { vault?: string; resolver?: string; nodeName?: string };
      if (parsed.vault) setVault(parsed.vault);
      if (parsed.resolver) setResolver(parsed.resolver);
      if (parsed.nodeName) setNodeName(parsed.nodeName);
    } catch {
      // A corrupted local record should never block the workspace.
    }
  }, []);

  useEffect(() => {
    if (!isAddress(vault)) return;
    try {
      window.localStorage.setItem(
        'payeelock.workspace',
        JSON.stringify({ vault, resolver, nodeName }),
      );
    } catch {
      // Storage may be unavailable in private modes.
    }
  }, [vault, resolver, nodeName]);

  const run = useCallback(async (message: string, action: () => Promise<string>) => {
    setStatus({ kind: 'busy', message });
    try {
      const result = await action();
      setStatus({ kind: 'ok', message: result });
      setVersion((value) => value + 1);
    } catch (error) {
      setStatus({ kind: 'error', message: walletErrorMessage(error) });
    }
  }, []);

  // Wallet availability is only known after mount.
  useEffect(() => {
    setWalletAvailable(hasInjectedWallet());
  }, []);

  // Keep the connected account and network in step with the wallet UI.
  useEffect(
    () =>
      watchWallet({
        onAccounts: (accounts) => {
          const next = accounts[0];
          if (!next) {
            setAccount(null);
            setStatus({ kind: 'idle', message: 'Wallet disconnected.' });
            return;
          }
          setAccount(next as Address);
        },
        onChain: (chainId) => {
          if (chainId !== sepolia.id) {
            setStatus({
              kind: 'error',
              message: 'Switch your wallet back to Sepolia to continue.',
            });
          }
          setVersion((value) => value + 1);
        },
      }),
    [],
  );

  useEffect(() => {
    if (!isAddress(vault)) {
      setLoaded(null);
      return;
    }
    let live = true;
    (async () => {
      try {
        const { publicClient } = sepoliaClients();
        const target = vault as Address;
        const [buyer, token, guardianAddress, reserved] = await Promise.all([
          publicClient.readContract({ address: target, abi: payeeLockAbi, functionName: 'BUYER' }),
          publicClient.readContract({ address: target, abi: payeeLockAbi, functionName: 'TOKEN' }),
          publicClient.readContract({
            address: target,
            abi: payeeLockAbi,
            functionName: 'guardian',
          }),
          publicClient.readContract({
            address: target,
            abi: payeeLockAbi,
            functionName: 'reserved',
          }),
        ]);
        const [symbol, decimals] = await Promise.all([
          publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'symbol' }),
          publicClient.readContract({ address: token, abi: erc20Abi, functionName: 'decimals' }),
        ]);
        const holder = account ?? buyer;
        const [balance, allowance] = await Promise.all([
          publicClient.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'balanceOf',
            args: [holder],
          }),
          publicClient.readContract({
            address: token,
            abi: erc20Abi,
            functionName: 'allowance',
            args: [holder, target],
          }),
        ]);
        const supplierRecord = (await publicClient.readContract({
          address: target,
          abi: payeeLockAbi,
          functionName: 'suppliers',
          args: [supplierId],
        })) as unknown as readonly [Address, Address, Address, string, bigint, boolean, boolean];
        if (!live) return;
        setLoaded({
          buyer,
          token,
          guardian: guardianAddress,
          reserved,
          symbol,
          decimals: Number(decimals),
          balance,
          allowance,
          supplierExists: supplierRecord[6],
          supplierEpoch: Number(supplierRecord[4]),
          frozen: supplierRecord[5],
          supplierBeneficiary: supplierRecord[0],
        });
        if (supplierRecord[6]) {
          const invoiceRecord = (await publicClient.readContract({
            address: target,
            abi: payeeLockAbi,
            functionName: 'invoices',
            args: [invoiceId],
          })) as unknown as readonly [string, bigint, bigint, Address, bigint, bigint, boolean];
          if (live && invoiceRecord[1] > 0n) {
            setSelected((current) => current ?? invoiceId);
            setRows((current) => {
              const label = invoiceKey || 'invoice';
              const exists = current.some((row) => row.id === invoiceId);
              return exists
                ? current
                : [...current, { id: invoiceId, label, total: invoiceRecord[1], migrate: true }];
            });
          }
        }
      } catch {
        if (live) setLoaded(null);
      }
    })();
    return () => {
      live = false;
    };
  }, [vault, account, supplierId, invoiceId, invoiceKey, version]);

  async function connect() {
    await run('Waiting for your wallet', async () => {
      const address = (await requestAccount()) as Address;
      await ensureSepolia();
      setAccount(address);
      if (!newPayout) setNewPayout(address);
      return 'Connected ' + short(address) + ' on Sepolia.';
    });
  }

  function signer() {
    if (!account) throw new Error('Connect a wallet first.');
    const { walletClient } = sepoliaClients();
    return walletClient;
  }

  async function createWorkspace() {
    await run('Deploying your workspace', async () => {
      if (!account) throw new Error('Connect a wallet first.');
      const { publicClient, walletClient } = sepoliaClients();
      const wallet = walletClient;

      if (FACTORY && isAddress(FACTORY)) {
        if (!TEST_TOKEN || !isAddress(TEST_TOKEN)) {
          throw new Error('The test asset address is not configured for this deployment.');
        }
        const hash = await wallet.writeContract({
          account,
          chain: sepolia,
          address: FACTORY as Address,
          abi: payeeLockFactoryAbi,
          functionName: 'createWorkspace',
          args: [TEST_TOKEN as Address, account, account, account],
        });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        const created = receipt.logs.flatMap((log) => {
          try {
            const decoded = decodeEventLog({
              abi: payeeLockFactoryAbi,
              data: log.data,
              topics: log.topics,
            });
            return decoded.eventName === 'WorkspaceCreated' ? [decoded.args] : [];
          } catch {
            return [];
          }
        })[0] as { vault: Address; resolver: Address } | undefined;
        if (!created) throw new Error('Workspace creation did not report a vault address.');
        setVault(created.vault);
        setResolver(created.resolver);
        setRows([]);
        setSelected(null);
        return 'Workspace ready in one transaction. You own vault ' + short(created.vault) + '.';
      }

      const tokenHash = await wallet.deployContract({
        account,
        chain: sepolia,
        abi: testUSDAbi,
        bytecode: testUSDBytecode,
        args: [account],
      });
      const tokenReceipt = await publicClient.waitForTransactionReceipt({ hash: tokenHash });
      if (!tokenReceipt.contractAddress) throw new Error('Test token deployment failed.');
      const token = tokenReceipt.contractAddress;

      const resolverHash = await wallet.deployContract({
        account,
        chain: sepolia,
        abi: workspaceResolverAbi,
        bytecode: workspaceResolverBytecode,
        args: [account, account],
      });
      const resolverReceipt = await publicClient.waitForTransactionReceipt({ hash: resolverHash });
      if (!resolverReceipt.contractAddress) throw new Error('Resolver deployment failed.');

      const vaultHash = await wallet.deployContract({
        account,
        chain: sepolia,
        abi: payeeLockAbi,
        bytecode: payeeLockBytecode,
        args: [token, account, account, account],
      });
      const vaultReceipt = await publicClient.waitForTransactionReceipt({ hash: vaultHash });
      if (!vaultReceipt.contractAddress) throw new Error('Vault deployment failed.');

      setVault(vaultReceipt.contractAddress);
      setResolver(resolverReceipt.contractAddress);
      setRows([]);
      setSelected(null);
      return 'Workspace ready. You own vault ' + short(vaultReceipt.contractAddress) + '.';
    });
  }

  async function mintTestDollars() {
    await run('Minting test dollars', async () => {
      if (!account) throw new Error('Connect a wallet first.');
      if (!TEST_TOKEN || !isAddress(TEST_TOKEN)) {
        throw new Error('No faucet token is configured. Use the token of a vault you created.');
      }
      const { publicClient } = sepoliaClients();
      const hash = await signer().writeContract({
        account,
        chain: sepolia,
        address: TEST_TOKEN as Address,
        abi: testUSDAbi,
        functionName: 'mint',
        args: [account, parseUnits('5000', 6)],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return 'Minted 5,000 test dollars to ' + short(account) + '.';
    });
  }

  async function setResolverAddress() {
    await run('Pointing the resolver at the payout wallet', async () => {
      if (!isAddress(resolver)) throw new Error('No resolver address is loaded.');
      if (!isAddress(payout)) throw new Error('Enter the supplier payout wallet.');
      const { publicClient } = sepoliaClients();
      const hash = await signer().writeContract({
        account: account!,
        chain: sepolia,
        address: resolver as Address,
        abi: workspaceResolverAbi,
        functionName: 'setAddr',
        args: [node, payout as Address],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return 'Resolver now serves ' + short(payout) + '.';
    });
  }

  async function registerSupplier() {
    await run('Registering the supplier', async () => {
      if (!isAddress(vault) || !isAddress(resolver)) throw new Error('No workspace is loaded.');
      if (!isAddress(payout)) throw new Error('Enter the supplier payout wallet.');
      const { publicClient } = sepoliaClients();
      const hash = await signer().writeContract({
        account: account!,
        chain: sepolia,
        address: vault as Address,
        abi: payeeLockAbi,
        functionName: 'registerSupplier',
        args: [supplierId, payout as Address, account!, resolver as Address, node],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return 'Supplier registered with payout ' + short(payout) + '.';
    });
  }

  async function prefundInvoice() {
    await run('Approving and prefunding the invoice', async () => {
      if (!loaded || !isAddress(vault)) throw new Error('No workspace is loaded.');
      const amount = parseUnits(invoiceTotal || '0', loaded.decimals);
      if (amount === 0n) throw new Error('Enter an invoice total.');
      const { publicClient } = sepoliaClients();
      if (loaded.allowance < amount) {
        const approveHash = await signer().writeContract({
          account: account!,
          chain: sepolia,
          address: loaded.token,
          abi: erc20Abi,
          functionName: 'approve',
          args: [vault as Address, amount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }
      const hash = await signer().writeContract({
        account: account!,
        chain: sepolia,
        address: vault as Address,
        abi: payeeLockAbi,
        functionName: 'approveInvoice',
        args: [invoiceId, supplierId, amount],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      setRows((current) =>
        current.some((row) => row.id === invoiceId)
          ? current
          : [...current, { id: invoiceId, label: invoiceKey, total: amount, migrate: true }],
      );
      setSelected(invoiceId);
      return 'Invoice prefunded. The vault now holds it.';
    });
  }

  async function payInvoice() {
    await run('Signing the payment authorization', async () => {
      if (!loaded || !isAddress(vault)) throw new Error('No workspace is loaded.');
      const target = selected ?? invoiceId;
      const { publicClient, walletClient } = sepoliaClients();
      const record = (await publicClient.readContract({
        address: vault as Address,
        abi: payeeLockAbi,
        functionName: 'invoices',
        args: [target],
      })) as unknown as readonly [string, bigint, bigint, Address, bigint, bigint, boolean];
      const amount = parseUnits(payAmount || '0', loaded.decimals);
      if (amount === 0n) throw new Error('Enter a payment amount.');
      const message = {
        invoiceId: target,
        amount,
        beneficiary: record[3],
        epoch: record[4],
        nonce: record[5],
        deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      };
      const signature = await walletClient.signTypedData({
        account: account!,
        domain: domain(vault as Address),
        types: paymentTypes,
        primaryType: 'Payment',
        message,
      });
      const hash = await walletClient.writeContract({
        account: account!,
        chain: sepolia,
        address: vault as Address,
        abi: payeeLockAbi,
        functionName: 'pay',
        args: [message, signature],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return 'Paid ' + payAmount + ' to ' + short(record[3]) + '.';
    });
  }

  async function pauseSupplier() {
    await run('Pausing payments', async () => {
      if (!isAddress(vault)) throw new Error('No workspace is loaded.');
      const { publicClient } = sepoliaClients();
      const hash = await signer().writeContract({
        account: account!,
        chain: sepolia,
        address: vault as Address,
        abi: payeeLockAbi,
        functionName: 'freeze',
        args: [supplierId],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return 'Supplier paused. Only the two parties can now recover.';
    });
  }

  async function activateRecovery() {
    await run('Activating recovery', async () => {
      if (!loaded || !isAddress(vault) || !isAddress(resolver))
        throw new Error('No workspace is loaded.');
      if (!isAddress(newPayout)) throw new Error('Enter the replacement payout wallet.');
      const chosen = rows.filter((row) => row.migrate).map((row) => row.id);
      if (chosen.length === 0) throw new Error('Select at least one unpaid invoice.');
      const { publicClient, walletClient } = sepoliaClients();
      const setHash = await walletClient.writeContract({
        account: account!,
        chain: sepolia,
        address: resolver as Address,
        abi: workspaceResolverAbi,
        functionName: 'setAddr',
        args: [node, newPayout as Address],
      });
      await publicClient.waitForTransactionReceipt({ hash: setHash });
      const nonce = await publicClient.readContract({
        address: vault as Address,
        abi: payeeLockAbi,
        functionName: 'migrationNonces',
        args: [supplierId],
      });
      const message = {
        supplierId,
        fromEpoch: BigInt(loaded.supplierEpoch),
        toEpoch: BigInt(loaded.supplierEpoch + 1),
        beneficiary: newPayout as Address,
        invoiceIdsHash: keccak256(encodeAbiParameters([{ type: 'bytes32[]' }], [chosen])),
        nonce,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 3600),
      };
      const signature = await walletClient.signTypedData({
        account: account!,
        domain: domain(vault as Address),
        types: migrationTypes,
        primaryType: 'Migration',
        message,
      });
      const hash = await walletClient.writeContract({
        account: account!,
        chain: sepolia,
        address: vault as Address,
        abi: payeeLockAbi,
        functionName: 'migrate',
        args: [message, chosen, signature],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      return 'Recovery activated. Old authorizations are now stale.';
    });
  }

  return (
    <section className="use-view" aria-label="Use PayeeLock on Sepolia testnet">
      <div className="section-heading">
        <span className="eyebrow">Sepolia testnet</span>
        <span className="pill">Real transactions</span>
      </div>
      <h2>Run your own supplier payments.</h2>
      <p className="explanation">
        Connect a wallet and this page deploys your own PayeeLock vault. You are the buyer, so you
        control the funding, the pause, and the recovery acceptance. Every step below is a real
        Sepolia transaction signed in your wallet.
      </p>

      <div className="ws-bar">
        <button className="primary" onClick={connect} disabled={busy}>
          {account ? 'Connected ' + short(account) : 'Connect wallet'}
          <Icon name="wallet" size={16} />
        </button>
        {TEST_TOKEN && isAddress(TEST_TOKEN) && (
          <button className="secondary" onClick={mintTestDollars} disabled={busy || !account}>
            Get 5,000 test dollars
          </button>
        )}
        {isAddress(vault) && loaded && (
          <span className="ws-chip">
            Vault {short(vault)} · {loaded.symbol} · held {units(loaded.reserved, loaded.decimals)}
          </span>
        )}
        <span className="ws-note">Unaudited prototype. Testnet only, never production funds.</span>
      </div>

      {!walletAvailable && (
        <p className="ws-status error" role="status">
          No browser wallet detected. Install MetaMask or another Ethereum wallet, then reload this
          page. The case review needs no wallet.
        </p>
      )}

      {status.message && (
        <p className={'ws-status ' + status.kind} role="status">
          {status.message}
        </p>
      )}

      {!isAddress(vault) && (
        <div className="ws-card">
          <h3>1 · Create your workspace</h3>
          <p className="ws-help">
            One transaction from your wallet creates your PayeeLock vault and its payout resolver.
            Your wallet is the buyer, so only you can fund, pause, and settle it.
          </p>
          <button className="primary" onClick={createWorkspace} disabled={busy || !account}>
            Create my vault
          </button>
          <OpenVault
            onOpen={(nextVault, nextResolver) => {
              setVault(nextVault.trim());
              setResolver(nextResolver.trim());
              setRows([]);
              setSelected(null);
            }}
          />
        </div>
      )}

      {isAddress(vault) && (
        <div className="ws-grid">
          <article className="ws-card">
            <h3>2 · Supplier</h3>
            <dl className="ws-facts">
              <div>
                <dt>Vault</dt>
                <dd>
                  <a
                    href={'https://sepolia.etherscan.io/address/' + vault}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {short(vault)} <Icon name="external" size={13} />
                  </a>
                </dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd>{loaded ? (loaded.frozen ? 'Paused' : 'Active') : 'Loading'}</dd>
              </div>
              <div>
                <dt>Payment version</dt>
                <dd>{loaded ? loaded.supplierEpoch : 0}</dd>
              </div>
            </dl>
            <label>
              Supplier key
              <input value={supplierKey} onChange={(event) => setSupplierKey(event.target.value)} />
            </label>
            <label>
              Payout address
              <input
                value={payout}
                onChange={(event) => setPayout(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <p className="ws-help">
              The supplier&apos;s own wallet, not yours. Any Sepolia address works for a trial run.
            </p>
            {!loaded?.supplierExists && (
              <>
                <button className="secondary" onClick={setResolverAddress} disabled={busy}>
                  Point resolver at this payout
                </button>
                <button className="primary" onClick={registerSupplier} disabled={busy}>
                  Register supplier
                </button>
              </>
            )}
            {loaded?.supplierExists && (
              <p className="ws-inline">Registered payout {short(loaded.supplierBeneficiary)}</p>
            )}
          </article>

          <article className="ws-card">
            <h3>3 · Invoice</h3>
            <label>
              Invoice key
              <input value={invoiceKey} onChange={(event) => setInvoiceKey(event.target.value)} />
            </label>
            <label>
              Total
              <input
                value={invoiceTotal}
                onChange={(event) => setInvoiceTotal(event.target.value)}
                inputMode="decimal"
              />
            </label>
            <button
              className="primary"
              onClick={prefundInvoice}
              disabled={busy || !loaded?.supplierExists}
            >
              Prefund invoice
            </button>
            <label>
              Payment amount
              <input
                value={payAmount}
                onChange={(event) => setPayAmount(event.target.value)}
                inputMode="decimal"
              />
            </label>
            <button className="primary" onClick={payInvoice} disabled={busy || !selected}>
              Sign and pay
            </button>
            {rows.length > 0 && (
              <ul className="ws-invoices">
                {rows.map((row) => (
                  <li key={row.id}>
                    <label>
                      <input
                        type="radio"
                        name="invoice"
                        checked={selected === row.id}
                        onChange={() => setSelected(row.id)}
                      />
                      {row.label}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </article>

          <article className="ws-card">
            <h3>4 · Recovery</h3>
            <label>
              Replacement payout
              <input
                value={newPayout}
                onChange={(event) => setNewPayout(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <label>
              Migrate invoices
              <span className="ws-checks">
                {rows.length === 0 && <em>No invoices yet</em>}
                {rows.map((row) => (
                  <span key={row.id}>
                    <input
                      type="checkbox"
                      checked={row.migrate}
                      onChange={(event) =>
                        setRows((current) =>
                          current.map((item) =>
                            item.id === row.id ? { ...item, migrate: event.target.checked } : item,
                          ),
                        )
                      }
                    />
                    {row.label}
                  </span>
                ))}
              </span>
            </label>
            <p className="ws-help">
              Pause first, then activate recovery. Activating sets the new payout on the resolver,
              signs the exact invoice list, and invalidates every old authorization.
            </p>
            <button
              className="secondary"
              onClick={pauseSupplier}
              disabled={busy || !loaded?.supplierExists}
            >
              Pause payments
            </button>
            <button
              className="primary"
              onClick={activateRecovery}
              disabled={busy || !loaded?.supplierExists}
            >
              Activate recovery
            </button>
          </article>
        </div>
      )}
    </section>
  );
}

function OpenVault({ onOpen }: { onOpen: (vault: string, resolver: string) => void }) {
  const [nextVault, setNextVault] = useState('');
  const [nextResolver, setNextResolver] = useState('');
  return (
    <details className="ws-open">
      <summary>Open a vault you already created</summary>
      <label>
        Vault address
        <input
          value={nextVault}
          onChange={(event) => setNextVault(event.target.value)}
          placeholder="0x..."
        />
      </label>
      <label>
        Resolver address
        <input
          value={nextResolver}
          onChange={(event) => setNextResolver(event.target.value)}
          placeholder="0x..."
        />
      </label>
      <button
        className="secondary"
        onClick={() => onOpen(nextVault, nextResolver)}
        disabled={!nextVault}
      >
        Open vault
      </button>
    </details>
  );
}
