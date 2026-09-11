# Source provenance

PayeeLock’s application, visual system, diagrams, and settlement/recovery logic were created for this project. Sponsor and reference repositories were read to confirm integration behavior; application code was not copied from earlier hackathon winners.

| Source                                                                           | Revision or page                                   | Use                                                                 |
| -------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) | v5.4.0, `c64a1edb67b6e3f4a15cca8909c9482ad33a02b0` | SafeERC20, EIP712, SignatureChecker, ReentrancyGuard, ERC20; MIT    |
| [forge-std](https://github.com/foundry-rs/forge-std)                             | v1.9.7, `77041d2ce690e692d6e03cc812b57d1ddaa4d505` | Solidity test utilities; Apache-2.0/MIT                             |
| [ENS contracts-v2](https://github.com/ensdomains/contracts-v2)                   | `48b3e2d39513b9dd32ef1850877a29009bc807b9`         | PermissionedResolver signatures and resource-scoped role semantics  |
| [Privy server wallets](https://docs.privy.io/controls/policies)                  | Documentation accessed September 2026              | Default-deny wallet policy and server authorization patterns        |
| [The Graph documentation](https://thegraph.com/docs/en/subgraphs/quick-start/)   | Documentation accessed September 2026              | Subgraph manifest, schema, mapping, build, and deployment flow      |
| [Remit](https://ethglobal.com/showcase/remit-m1i0b)                              | ETHGlobal Lisbon 2026 showcase                     | Compared exact-digest approvals with PayeeLock's recovery boundary  |
| [PayFlow](https://ethglobal.com/showcase/payflow-jg28k)                          | HackMoney 2026 showcase                            | Compared invoice and ENS routing with PayeeLock's recovery boundary |

## Prior-art boundary

Remit already binds a payment request to an exact digest and escalates risky changes to authorized humans. PayFlow already combines invoice parsing, ENS identity, Privy authentication, and cross-chain routing. PayeeLock does not present those ideas as new.

PayeeLock's contribution is the settlement state transition after a supplier payout route becomes unsafe. It preserves paid history, moves only the unpaid remainder across an exact invoice set, and makes every pre-recovery epoch and nonce unusable. The implementation and comparison were produced independently; no source code from either project was copied.

The pre-build selection memo considered Ledger as the supplier's recovery signer. The final build does not claim Ledger integration. It uses a separate EIP-712 recovery signer, Privy's constrained guardian, and The Graph for indexed evidence.

An ERC-8004 registration was tested during development and remains immutable on Sepolia. It is not a dependency, sponsor target, or product claim in the final architecture.

## Visual assets

- `docs/assets/payeelock-lockup.svg`, `architecture.svg`, and `recovery-flow.svg` are original project artwork.
- `docs/assets/partners/ethereum.png` comes from the [Ethereum.org asset library](https://ethereum.org/assets/).
- `docs/assets/partners/ens.png` represents the official [ENS GitHub organization](https://github.com/ensdomains); use follows the [ENS logo guide](https://thorin.ens.domains/guides/logo) and [trademark guidelines](https://ens.domains/legal/trademark-guidelines).
- `docs/assets/partners/privy.png` represents the official [Privy GitHub organization](https://github.com/privy-io).
- `docs/assets/partners/the-graph.svg` is the unmodified dark logomark from [The Graph's official brand page](https://thegraph.com/brand/).

Those organization marks identify integrations only. Their owners retain all trademark rights and do not imply endorsement.

Installed SDK declarations and bundled Next.js documentation were checked against the implementation. Solidity dependencies are reproducible through `tooling/bootstrap.sh`; npm workspace versions are locked in `package-lock.json`, and direct runtime versions are pinned in their owning package manifests.

`TestFixtures.sol` implements only the ERC-20 and permission boundary required for deterministic contract testing. It is not copied from PermissionedResolver and is not presented as sponsor deployment evidence. The public integration claims point to Sepolia receipts in `deployments/sepolia-proof.json`.
