# Validation record

Validated on September 13, 2026 against the current source and live Sepolia deployment.

| Check                          | Result                                                                                                                                                  |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run repo:check`           | Three workspace boundaries, naming, empty paths, retired files, local links, environment keys, and deployment metadata passed                           |
| `npm test`                     | 23 passed, 0 failed; partial-payment fuzz test ran 512 cases; factory ownership and resolver authority covered                                          |
| `npm run test:e2e`             | 10 direct-chain lifecycle assertions passed                                                                                                             |
| `npm run typecheck`            | Passed                                                                                                                                                  |
| `npm run build`                | Turbo built the contracts, Subgraph, and optimized Next.js 16 application successfully                                                                  |
| `npm run graph:build`          | Schema code generation and both AssemblyScript mappings compiled                                                                                        |
| `gitleaks detect --no-git`     | No secrets found after excluding ignored local, generated, vendored, and submission-only files                                                          |
| `npm run monitor:inspect`      | Live Graph evidence read; three configured ENS actors matched; no pause condition matched                                                               |
| `npm run guardian:status`      | Privy wallet matches the PayeeLock guardian and freeze policy is attached                                                                               |
| `npm run guardian:policy-test` | Unmatched one-wei transfer rejected with `policy_violation`; nothing broadcast                                                                          |
| `npm audit --omit=dev`         | 0 vulnerabilities in production dependencies                                                                                                            |
| Production deployment          | Vercel built the `apps/web` workspace and [`payeelock-sentinel.vercel.app`](https://payeelock-sentinel.vercel.app) returned 200 with live Sepolia state |
| The Graph Studio               | 1 supplier, 3 invoices, 13 PayeeLock events, 9 ENS events; no indexing errors                                                                           |
| Responsive production UI       | 390 px viewport, document width 390 px, final settlement visible                                                                                        |
| Walkthrough preflight          | 3:56.68 H.264/AAC export, 1280×880, 19 evidence-synced scenes, captions, natural 1.00× playback, native macOS cursor artwork                            |
| Public workspace factory       | `0xf768…fd15` deployed to Sepolia; a live `createWorkspace` call produced vault `0x4892…6287` owned by the caller                                       |
| Workspace browser flow         | 8 local checks replaying the shipped bytecode, ABIs, and EIP-712 types from deployment through final settlement                                         |

The full development dependency audit reports advisories inherited through `@graphprotocol/graph-cli@0.98.1`, which is the current published Graph CLI version. It is used only to compile and deploy trusted local Subgraph sources and is excluded from the production dependency audit.

## Lifecycle assertions

The isolated runner deploys a fresh token, resolver fixture, and vault, then proves:

1. 14,000 is prefunded, 2,400 is paid normally, and 11,600 remains reserved.
2. The invoice publisher cannot write the payout address but can update permitted metadata.
3. The guardian freezes every outstanding obligation.
4. A previously valid payment reverts while frozen.
5. The supplier recovery signature binds the exact three-invoice set.
6. Buyer acceptance preserves paid history and invalidates old nonces.
7. The same old authorization also reverts after recovery.
8. Every unpaid remainder reaches only the replacement beneficiary.
9. The final payment cannot execute twice.

The runner writes exact local receipts to `.runtime/e2e-result.json`. That directory is intentionally ignored. Public Sepolia receipts and final balances live in [`deployments/sepolia-proof.json`](../deployments/sepolia-proof.json).

## Intentional failures

Reverted receipts are product evidence, not test noise. The Sepolia case deliberately broadcasts both an unauthorized ENS address edit and an old payment after recovery. Their failed status proves the relevant boundaries onchain.

## Video preflight

The walkthrough was captured from the final app in an isolated background instance of installed Google Chrome. The current 19-scene cut keeps the partial payment, ENS permission failure, Privy freeze, bilateral recovery, stale-payment rejection, settlement, and live Graph evidence. It runs for 3 minutes 56.68 seconds at natural 1.00× playback; the edit removes whole redundant scenes and does not use `setpts` or `atempo` acceleration.

The current local narration is a synthetic timing preview and is not eligible for ETHGlobal submission. ETHGlobal's published video rules prohibit text-to-speech and AI voiceover. The submitted upload must replace it with the builder's own narration while keeping the verified natural-speed picture cut. The source capture's cursor audit reports 65 varied purposeful moves, four eased scrolls, 41 settling corrections, and a movement-duration standard deviation of 0.189 seconds.
