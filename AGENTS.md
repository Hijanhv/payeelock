<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# PayeeLock product direction

PayeeLock is a recovery protocol for approved onchain supplier payments. If a supplier's payout wallet becomes unsafe, payments can be paused and the buyer and supplier can migrate only the unpaid invoice balance. Previously paid value remains final, and every pre-recovery payment authorization becomes stale.

Keep these product boundaries consistent across code, UI, documentation, diagrams, and demos:

- Do not describe PayeeLock, its monitor, or its Privy guardian as AI, an LLM, or an autonomous agent.
- Do not use ERC-8004 as a product dependency or headline integration. Historical deployment evidence may remain archived, but it is not part of the submission story.
- Call the offchain process the recovery monitor. It reads indexed history, confirms current RPC state, and may request only `freeze(bytes32)`.
- ENSv2 is the supplier identity and authority layer: invoice publishing permission is separate from payout-address authority.
- Privy is the constrained business-wallet layer: its default-deny policy permits the guardian wallet to pause one supplier on one PayeeLock deployment and forbids transfers or recovery.
- The Graph is evidence infrastructure. It indexes the payment, recovery, and ENS history shown in the case review; it is not an execution oracle and is not presented as an AI integration.
- The protocol, not the monitor, is the product. Lead with bilateral recovery, preservation of partial-payment history, and stale-authorization rejection.
- The public app is a read-only review of mined Sepolia transactions. Never imply that its navigation controls submit transactions.
- Use sentence case, plain business language, and the names Meridian Labs (buyer) and Harbor Systems (cloud and security supplier).

# Repository structure

This is a Turborepo with three explicit product boundaries. `apps/web` is the deployable Next.js interface, `packages/contracts` is the Foundry protocol and its TypeScript contract interface, and `packages/subgraph` is the deployable Graph indexer. Root tooling coordinates workflows that cross those boundaries.

- Keep application code in `apps/web/`, Solidity and contract-owned TypeScript in `packages/contracts/`, Subgraph code in `packages/subgraph/`, cross-system operations in `tooling/`, public deployment records in `deployments/`, and durable documentation in `docs/`. Local video exports and production files belong in the ignored `artifacts/` directory and must not be committed.
- Use kebab-case for project-authored TypeScript, scripts, documentation, assets, and directories.
- Preserve ecosystem-standard names such as `README.md`, `AGENTS.md`, and `next.config.ts`. Solidity sources and Subgraph ABI files stay aligned with their contract symbols; generated TypeScript ABI modules use kebab-case.
- Do not keep empty placeholder directories or checked-in build output. Generated and local working data belongs only in the ignored paths listed in `.gitignore`; the committed ABI modules in `packages/contracts/generated/` are the deliberate exception because both the web app and tooling consume them.
- Treat `README.md` as the concise product entry point. Put detailed architecture, threat analysis, integration evidence, provenance, validation, and demo production notes in the matching files under `docs/`.
- Run `npm run repo:check` after moving files or changing documentation links. Run `npm run verify` before packaging a submission.
