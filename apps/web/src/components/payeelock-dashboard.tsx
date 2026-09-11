'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BrandMark } from '@/components/graphics/brand';
import { Icon } from '@/components/graphics/icons';
import type { PayeeLockCase } from '@/lib/payeelock-case';

const money = (value: string | number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(Number(value));
const short = (value: string) => `${value.slice(0, 8)}…${value.slice(-6)}`;
const txUrl = (hash: string) => `https://sepolia.etherscan.io/tx/${hash}`;
const labels = [
  'Approved invoices',
  'First payment',
  'Payout edit rejected',
  'Payments paused',
  'Wallet recovered',
  'Old payment rejected',
  'Final settlement',
];
const titles = [
  'Three invoices. One supplier.',
  '$2,400 paid. $11,600 still protected.',
  'A publishing key cannot change who gets paid.',
  'The remaining money stays in the vault.',
  'Two parties approve the new wallet.',
  'An old payment cannot be used again.',
  'Harbor receives exactly what it is owed.',
];
const descriptions = [
  'Meridian buys cloud infrastructure and security services from Harbor. It sets aside the full invoice amount before paying.',
  'A valid installment reaches Harbor’s original wallet. The rest stays reserved for these invoices.',
  'In a separate permission test, Harbor’s publishing key tries to replace its payout address. ENS rejects the transaction.',
  'The Privy guardian pauses Harbor’s payments. Its permission ends here: it cannot send money or select another wallet.',
  'Harbor signs the replacement wallet and all three invoices. Meridian accepts the same proposal onchain.',
  'A payment signed before recovery is submitted again. Its old wallet, epoch, and nonce are no longer valid.',
  'Fresh payments settle the unpaid amounts to Harbor’s replacement wallet. Previously paid money stays where it was sent.',
];

function Receipt({ data, active }: { data: PayeeLockCase; active: number }) {
  const step = data.steps[active];
  const receipt = data.receipts.find((item) => item.hash === step.transaction);
  return (
    <div className="receipt-detail">
      <div className="section-heading">
        <h3>Transaction receipt</h3>
        <span className="pill">{receipt ? 'Read from Sepolia' : 'Saved reference'}</span>
      </div>
      <dl>
        <div>
          <dt>Result</dt>
          <dd>
            {receipt?.status === 'reverted'
              ? 'Reverted · no transfer'
              : receipt?.status === 'success'
                ? 'Confirmed'
                : 'Live receipt unavailable'}
          </dd>
        </div>
        <div>
          <dt>Block</dt>
          <dd>{(receipt?.block ?? step.block).toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt>Transaction</dt>
          <dd>
            <a href={txUrl(step.transaction)} target="_blank" rel="noreferrer">
              {short(step.transaction)} <Icon name="external" size={14} />
            </a>
          </dd>
        </div>
      </dl>
    </div>
  );
}

export function PayeeLockDashboard({ data }: { data: PayeeLockCase }) {
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [tab, setTab] = useState('case');
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [eventFilter, setEventFilter] = useState('All events');
  const [refreshing, startRefresh] = useTransition();

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const step = Number(search.get('step'));
    if (step >= 1 && step <= 7 && Number.isInteger(step)) {
      setActive(step - 1);
      setReceiptOpen(step === 3);
    }
    if (['evidence', 'permissions'].includes(search.get('view') || '')) setTab(search.get('view')!);
  }, []);

  function select(index: number) {
    setActive(index);
    setReceiptOpen(index === 2);
    const url = new URL(window.location.href);
    url.searchParams.set('step', String(index + 1));
    window.history.replaceState({}, '', url);
  }
  const recovered = active >= 4;
  const final = active === 6;
  const paid = active === 0 ? 0 : 2400;
  const held = active === 0 ? 14000 : final ? 0 : 11600;
  const events = data.graph.events.filter(
    (event) =>
      eventFilter === 'All events' ||
      (eventFilter === 'Payments'
        ? event.kind === 'InvoicePaid'
        : eventFilter === 'Recovery'
          ? ['RecoveryActivated', 'InvoiceMigrated', 'SupplierFrozen'].includes(event.kind)
          : event.source === 'ENS'),
  );

  return (
    <div className="workspace">
      <header className="app-header">
        <a href="/" className="wordmark">
          <BrandMark />
          <span>PayeeLock</span>
        </a>
        <span className="network-label">
          Ethereum Sepolia <span aria-hidden="true">·</span> Testnet
        </span>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">Supplier payments</p>
            <h1>Pay the supplier. Protect the payment.</h1>
            <p className="lede">Pause an unsafe wallet. Recover unpaid invoices together.</p>
          </div>
        </div>
        <div className="party-row">
          <span>
            <strong>Meridian Labs</strong> Buyer
          </span>
          <Icon name="arrow" size={19} />
          <span>
            <strong>Harbor Systems</strong> Cloud & security supplier
          </span>
        </div>
        <nav className="tabs" aria-label="Workspace views">
          {[
            ['case', 'Case review'],
            ['evidence', 'Live evidence'],
            ['permissions', 'Permissions'],
          ].map(([id, label]) => (
            <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </nav>
        {tab === 'case' && (
          <div className="case-layout">
            <nav className="journey" aria-label="Case events">
              <p>Review the case</p>
              {labels.map((label, index) => (
                <button
                  key={label}
                  onClick={() => select(index)}
                  aria-current={active === index ? 'step' : undefined}
                >
                  <span className="step-dot">{index + 1}</span>
                  {label}
                </button>
              ))}
              <small>
                Recorded transactions.
                <br />
                Selecting an event does not send funds.
              </small>
            </nav>
            <section className="case-content" aria-label="Selected case event">
              <div className="section-heading">
                <span className="eyebrow">{data.steps[active].source} evidence</span>
                <span className="pill">
                  {active === 2 || active === 5
                    ? 'Rejected'
                    : active === 3
                      ? 'Paused'
                      : final
                        ? 'Settled'
                        : 'Confirmed'}
                </span>
              </div>
              <h2>{titles[active]}</h2>
              <p className="explanation">{descriptions[active]}</p>
              {active === 2 ? (
                <div className="permission-comparison">
                  <div>
                    <span>Invoice text</span>
                    <strong>Allowed</strong>
                  </div>
                  <div>
                    <span>Payout address</span>
                    <strong>Rejected</strong>
                  </div>
                  <small>This permission test was mined before the invoice lifecycle.</small>
                </div>
              ) : active === 4 ? (
                <div className="recovery-approval">
                  <div>
                    <span>Harbor signs</span>
                    <strong>New wallet + 3 invoices</strong>
                  </div>
                  <div>
                    <span>Meridian accepts</span>
                    <strong>The same proposal</strong>
                  </div>
                  <p>
                    New payout wallet <code>{short(data.newBeneficiary)}</code>
                    <br />
                    Payment version <strong>0 → 1</strong> · Previous authorizations invalidated
                  </p>
                </div>
              ) : (
                <div className="amounts" aria-label="Accounting at selected stage">
                  <div>
                    <span>Old Harbor wallet</span>
                    <strong>{money(paid)}</strong>
                  </div>
                  <div>
                    <span>Held in vault</span>
                    <strong>{money(held)}</strong>
                  </div>
                  <div>
                    <span>New Harbor wallet</span>
                    <strong>{money(final ? 11600 : 0)}</strong>
                  </div>
                </div>
              )}
              {!receiptOpen && (
                <div className="invoice-table-wrap">
                  <table>
                    <caption>
                      {active === 2
                        ? 'Approved invoice set in this case'
                        : 'Invoices at this stage'}{' '}
                      <span>Amounts in MockUSDC</span>
                    </caption>
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th>Total</th>
                        <th>Unpaid</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.invoices.map((invoice, i) => {
                        const total = Number(invoice.total);
                        const remaining = final ? 0 : total - (active > 0 && i === 0 ? 2400 : 0);
                        return (
                          <tr key={invoice.id}>
                            <td>
                              <strong>{invoice.description.split(' · ')[0]}</strong>
                              <small>{invoice.label}</small>
                            </td>
                            <td>{money(total)}</td>
                            <td>{money(remaining)}</td>
                            <td>
                              {final
                                ? 'Paid'
                                : active === 3
                                  ? 'Paused'
                                  : recovered
                                    ? 'Recovered'
                                    : active > 0 && i === 0
                                      ? 'Part paid'
                                      : 'Approved'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {receiptOpen && <Receipt data={data} active={active} />}
              <div className="case-actions">
                <button className="secondary" onClick={() => setReceiptOpen(!receiptOpen)}>
                  {receiptOpen ? 'Back to invoices' : 'Inspect receipt'}
                  <Icon name={receiptOpen ? 'receipt' : 'external'} size={16} />
                </button>
                <button
                  className="primary"
                  disabled={active === 6}
                  onClick={() => select(active + 1)}
                >
                  {active === 6 ? 'Case complete' : 'Next event'}
                  <Icon name="arrow" size={17} />
                </button>
              </div>
            </section>
          </div>
        )}
        {tab === 'evidence' && (
          <section className="evidence-view">
            <div className="section-heading">
              <div className="graph-heading">
                <img src="/partners/the-graph.svg" alt="The Graph" width="30" height="30" />
                <div>
                  <h2>Follow the money in The Graph</h2>
                  <p>Contract events fetched from the deployed Subgraph.</p>
                </div>
              </div>
              <button
                className="secondary"
                disabled={refreshing}
                onClick={() => startRefresh(() => router.refresh())}
              >
                {refreshing ? 'Refreshing…' : 'Refresh evidence'}
              </button>
            </div>
            {data.graph.status === 'live' ? (
              <>
                <div className="evidence-summary">
                  <span>
                    <strong>{data.graph.invoiceCount}</strong> invoices
                  </span>
                  <span>
                    <strong>{data.graph.contractEventCount}</strong> payment & recovery events
                  </span>
                  <span>
                    <strong>{data.graph.ensEventCount}</strong> ENS events
                  </span>
                  <small>Indexed block {data.graph.indexedBlock?.toLocaleString('en-US')}</small>
                </div>
                <div className="filters" aria-label="Filter indexed events">
                  {['All events', 'Payments', 'Recovery', 'ENS'].map((filter) => (
                    <button
                      key={filter}
                      aria-pressed={eventFilter === filter}
                      onClick={() => setEventFilter(filter)}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
                <div className="event-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Event</th>
                        <th>Amount</th>
                        <th>Block</th>
                        <th>Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {events.map((event) => (
                        <tr key={event.id}>
                          <td>
                            <strong>{event.kind.replace(/([a-z])([A-Z])/g, '$1 $2')}</strong>
                            <small>{event.source}</small>
                          </td>
                          <td>{event.amount === null ? '—' : money(event.amount)}</td>
                          <td>{Number(event.block).toLocaleString('en-US')}</td>
                          <td>
                            <a
                              aria-label={`Receipt for ${event.kind} at block ${event.block}`}
                              href={txUrl(event.transaction)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {short(event.transaction)} <Icon name="external" size={14} />
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <p role="status">
                {data.graph.status === 'pending'
                  ? 'The Subgraph endpoint is not configured.'
                  : 'The Subgraph could not be reached. Try refreshing.'}
              </p>
            )}
            <div className="evidence-bottom">
              <p>
                The recovery monitor reads this history, then confirms the current wallet on Sepolia
                before requesting a pause.
              </p>
              <a href={data.graph.studioUrl} target="_blank" rel="noreferrer">
                Open Subgraph Studio <Icon name="external" size={14} />
              </a>
            </div>
          </section>
        )}
        {tab === 'permissions' && (
          <section className="permissions-view">
            <h2>Who can do what?</h2>
            <p className="explanation">
              Stopping a payment and changing its destination require different authority.
            </p>
            <div className="authority-list">
              <article>
                <span className="authority-name">
                  Recovery monitor <small>Privy guardian</small>
                </span>
                <div>
                  <h3>Pause payments only</h3>
                  <p>
                    Allowed: pause this supplier on this contract.
                    <br />
                    Not allowed: transfer funds or choose a new wallet.
                  </p>
                  <a href={txUrl(data.steps[3].transaction)} target="_blank" rel="noreferrer">
                    Guardian freeze receipt <Icon name="external" size={14} />
                  </a>
                </div>
              </article>
              <article>
                <span className="authority-name">
                  Harbor <small>Supplier</small>
                </span>
                <div>
                  <h3>Propose a replacement wallet</h3>
                  <p>Signs the new wallet and the exact unpaid invoice set.</p>
                </div>
              </article>
              <article>
                <span className="authority-name">
                  Meridian <small>Buyer</small>
                </span>
                <div>
                  <h3>Accept the same recovery</h3>
                  <p>The contract changes payment versions and invalidates old signatures.</p>
                </div>
              </article>
            </div>
            <div className="authority-note">
              <Icon name="identity" size={20} />
              <span>The guardian may pause. Only Harbor and Meridian can complete recovery.</span>
              <a href={txUrl(data.steps[3].transaction)} target="_blank" rel="noreferrer">
                Verify the pause <Icon name="external" size={14} />
              </a>
            </div>
          </section>
        )}
        <footer>
          <span>
            {data.connected
              ? 'Current chain balances · Settled case'
              : 'Saved final balance snapshot'}{' '}
            · Old wallet {money(data.oldBalance)} · New wallet {money(data.newBalance)} · Vault{' '}
            {money(data.reserved)}
          </span>
          <a
            href={`https://sepolia.etherscan.io/address/${data.contract}`}
            target="_blank"
            rel="noreferrer"
          >
            View contract <Icon name="external" size={13} />
          </a>
        </footer>
      </main>
    </div>
  );
}
