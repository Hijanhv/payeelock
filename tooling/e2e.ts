import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createPublicClient, http, type Hex } from 'viem';
import { foundry } from 'viem/chains';
import { createAnvilProof, type AnvilSession } from '@payeelock/contracts/test-support/anvil-proof';
import type { WorkspaceState } from '@payeelock/contracts/test-support/types';
import { deployAnvilFixture } from './anvil-fixture';

const rpcUrl = 'http://127.0.0.1:8557';
const rpc = createPublicClient({
  chain: foundry,
  transport: http(rpcUrl, { retryCount: 0, timeout: 1_000 }),
});
const anvil = spawn(
  'anvil',
  ['--host', '127.0.0.1', '--port', '8557', '--chain-id', '31337', '--silent'],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);
let saved: AnvilSession | undefined;
const checks: string[] = [];
const ok = (label: string) => {
  checks.push(label);
  console.log(`PASS ${label}`);
};

async function waitForAnvil() {
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      if ((await rpc.getChainId()) === 31337) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error('Acceptance-test Anvil did not start.');
}

async function reverted(state: WorkspaceState) {
  assert.equal(state.activity[0].kind, 'blocked');
  assert.ok(state.activity[0].hash);
  const receipt = await rpc.getTransactionReceipt({ hash: state.activity[0].hash as Hex });
  assert.equal(receipt.status, 'reverted');
}

async function main() {
  await waitForAnvil();
  const manifest = await deployAnvilFixture(rpcUrl, false);
  const controller = createAnvilProof(manifest, {
    load: (deploymentId) =>
      saved?.deploymentId === deploymentId ? structuredClone(saved) : undefined,
    save: (session) => {
      saved = structuredClone(session);
    },
  });
  let state = await controller.getState();
  assert.equal(state.protected, '11600');
  assert.equal(state.paid, '2400');
  assert.equal(state.oldBalance, '2400');
  assert.equal(state.newBalance, '0');
  ok('Fresh deployment: 14,000 funded, 2,400 settled, 11,600 reserved');

  state = await controller.act('attack');
  await reverted(state);
  assert.equal(state.supplier.beneficiary, state.oldBeneficiary);
  ok('Publisher payout-address attack has a real reverted receipt');

  state = await controller.act('publish');
  assert.equal(state.supplier.endpoint, 'https://harbor.example/invoices/v2');
  ok('The same restricted publisher can still update invoice metadata');

  state = await controller.act('freeze');
  assert.equal(state.supplier.frozen, true);
  assert.ok(state.invoices.every((invoice) => invoice.status === 'Frozen'));
  ok('Recovery authority freezes every outstanding obligation');

  state = await controller.act('replay');
  await reverted(state);
  assert.equal(state.protected, '11600');
  ok('Previously valid signed payment reverts while frozen');

  state = await controller.act('propose');
  assert.equal(state.proposal?.invoiceIds.length, 3);
  assert.equal(state.proposal?.fromEpoch, 0);
  assert.equal(state.proposal?.toEpoch, 1);
  ok('Recovery signature binds the exact three unpaid obligations');

  state = await controller.act('migrate');
  assert.equal(state.supplier.frozen, false);
  assert.equal(state.supplier.epoch, 1);
  assert.equal(state.supplier.beneficiary.toLowerCase(), state.newBeneficiary.toLowerCase());
  assert.equal(state.paid, '2400');
  assert.equal(state.protected, '11600');
  assert.equal(state.invoices[0].nonce, 2);
  ok('Buyer acceptance preserves paid history and invalidates old nonces');

  state = await controller.act('replay');
  await reverted(state);
  ok('Old authorization also reverts after recovery completes');

  for (const invoice of state.invoices) {
    if (Number(invoice.remaining) > 0) state = await controller.act('pay', invoice.id);
  }
  assert.equal(state.protected, '0');
  assert.equal(state.paid, '14000');
  assert.equal(state.oldBalance, '2400');
  assert.equal(state.newBalance, '11600');
  assert.ok(state.invoices.every((invoice) => invoice.status === 'Paid'));
  ok('Every unpaid remainder reaches only the replacement beneficiary');

  state = await controller.act('duplicate');
  await reverted(state);
  assert.equal(state.paid, '14000');
  assert.equal(state.newBalance, '11600');
  ok('The exact final payment cannot execute twice');

  await mkdir('.runtime', { recursive: true });
  await writeFile(
    '.runtime/e2e-result.json',
    JSON.stringify({ passed: checks.length, checks, finalState: state }, null, 2),
  );
  console.log(`\n${checks.length} direct-chain checks passed. Evidence: .runtime/e2e-result.json`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    anvil.kill('SIGTERM');
  });
