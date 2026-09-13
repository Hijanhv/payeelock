# ETHOnline 2026 submission draft

## Project details

Project name: PayeeLock

Category: Wallet/Payments

Emoji: 🔒

Demo: pending compliant human-narrated upload

Short description:

> Recover unpaid invoice balances without rewriting completed onchain payments.

Description:

> PayeeLock is a recovery protocol for approved supplier payments. If a supplier's payout wallet becomes unsafe, a constrained guardian can pause the unpaid invoices, but it cannot move funds or choose a new recipient. The supplier proposes a replacement wallet and the buyer accepts the exact same invoice set onchain. Previously paid value stays final, only the unpaid balance moves, and every authorization signed before recovery becomes stale.
>
> Anyone can use it today. Connect a wallet at payeelock-sentinel.vercel.app and the app deploys your own vault where your wallet is the buyer: register a supplier, prefund an invoice, pay it with a signed authorization, pause the supplier, and complete recovery. A separate review mode walks through a completed Sepolia case between Meridian Labs and Harbor Systems, where 2,400 MockUSDC was paid before the incident, 11,600 was settled after recovery, and an old queued payment reverted with zero tokens moved.

How it's made:

> I built the PayeeLock vault in Solidity and tested it with Foundry, including replay, expiry, wrong-beneficiary, freeze, exact-invoice-set recovery, fee-on-transfer, partial-payment fuzz cases, and factory ownership isolation. EIP-712 payment signatures bind the beneficiary, supplier epoch, invoice nonce, amount, expiry, chain ID, and contract. A permissionless factory deployed on Sepolia creates a vault and its payout resolver in one transaction with the caller as buyer, so anyone can run their own workspace. ENSv2 on Sepolia is the supplier identity and authority layer: a Permissioned Resolver lets an invoice publisher edit invoice text but not the payout address. A Privy server wallet is the freeze-only guardian under a default-deny policy scoped to one chain, one PayeeLock deployment, and `freeze(bytes32)`. The recovery monitor reads indexed history from a deployed Graph Subgraph, confirms current state through Sepolia RPC, and may request only that freeze call. The Graph also indexes payment, recovery, and ENS events for the case review. The frontend uses Next.js and viem, signs typed data in the browser, and is hosted on Vercel. The repository is a Turborepo with separate web, Foundry, and Subgraph workspaces plus isolated Anvil lifecycle tests.

Repository: https://github.com/Hijanhv/payeelock

Live app: https://payeelock-sentinel.vercel.app

Product workspace: https://payeelock-sentinel.vercel.app/?mode=use

Workspace factory (Sepolia): https://sepolia.etherscan.io/address/0xf76802b72f97c21da6d2934034061f06d0eefd15

## Tech stack

- Ethereum Sepolia
- Solidity
- Foundry
- EIP-712
- PayeeLock factory and workspace resolver
- ENSv2 Permissioned Resolver
- Privy server wallets and policies
- The Graph Subgraph Studio
- GraphQL
- TypeScript
- viem
- Next.js
- Vercel
- Turborepo

## Prize selections

Select ENS and Privy.

Do not select The Graph. PayeeLock uses a live deployed Subgraph as evidence infrastructure, but the current build does not compose two Graph products, use a standardized schema, or provide an AI use case. It does not meet the published Graph prize requirements.

### ENS

> ENSv2 is central to PayeeLock's supplier authority model. Harbor Systems uses an ENSv2 name on Sepolia with a Permissioned Resolver. Enhanced Access Control separates invoice-publishing permission from payout-address authority: the publisher successfully updates invoice metadata, while its attempted payout-address change reverts onchain. A separate recovery authority updates the address used by the bilateral recovery proposal. The public app and README link to the registration, role, failed-write, and address-change receipts.

### Privy

> Privy provides the constrained business wallet used by PayeeLock's recovery monitor. The server wallet is the onchain guardian, and its default-deny policy allows one action only: `freeze(bytes32)` on one PayeeLock deployment on Sepolia. The completed business workflow shows that wallet pausing Harbor Systems' outstanding invoices. A separate policy test attempts a one-wei transfer and is rejected by Privy before broadcast, proving the guardian cannot transfer funds or perform recovery.

## Future

> Next I would commission a contract audit, support controlled resolver and recovery-signer rotation, add production stablecoin deployments, publish the Subgraph to the decentralized Graph Network, and integrate incident inputs from supplier security systems. The recovery boundary would stay the same: monitoring may request a pause, while the supplier and buyer must approve the replacement route together.

## Final checklist

- [ ] Replace synthetic timing narration with the builder's own voice.
- [ ] Verify the final video is 2–4 minutes, at least 720p, and natural 1.00× speed.
- [ ] Upload the human-narrated video and add its URL above.
- [ ] Make the GitHub repository public.
- [ ] Confirm the live Vercel app and public repository both load without authentication.
- [ ] Save project details, images, tech stack, ENS and Privy prize answers, video, future, and AI-use disclosure.
- [ ] Review the final preview and submit.
