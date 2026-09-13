# Architecture

PayeeLock protects the destination and replay state of an already approved business obligation. A narrowly constrained guardian may pause payments; only the supplier and buyer together can activate a replacement route.

Anyone can run their own instance. The factory creates an isolated vault where the caller is the buyer, so there is no shared custody and no operator able to touch another workspace's funds. The Meridian Labs deployment is one such vault, kept as the verified example.

![PayeeLock architecture](assets/architecture.svg)

## Components

| Component                   | Responsibility                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `PayeeLock.sol`             | Prefund invoices, verify payments, pause suppliers, migrate exact invoice sets, and settle unpaid remainders |
| `PayeeLockFactory.sol`      | Create a vault and resolver in one transaction with the caller as buyer                                      |
| `WorkspaceResolver.sol`     | Serve payout addresses for vaults that do not use an ENSv2 name                                              |
| ENSv2 Permissioned Resolver | Separate invoice-metadata permission from payout-address authority                                           |
| The Graph Subgraph          | Index PayeeLock and resolver events for the review interface and recovery monitor                            |
| Recovery monitor            | Match indexed history against explicit pause conditions and confirm current resolver state over RPC          |
| Privy guardian              | Sign only `freeze(bytes32)` for one PayeeLock deployment under a default-deny policy                         |
| Supplier recovery signer    | Authorize the replacement beneficiary and exact invoice set                                                  |
| Buyer                       | Fund invoices, authorize payments, and accept the supplier's exact recovery proposal                         |
| Browser wallet              | Deploy a workspace, sign payments and migrations, and submit every workspace transaction                     |

The Graph is evidence infrastructure, not an execution oracle. Privy's policy and PayeeLock's immutable guardian role define what the monitor may do. PayeeLock verifies payment and migration conditions again when state changes.

## Workspace creation

`PayeeLockFactory.createWorkspace` is permissionless. It deploys a `PayeeLock` with `msg.sender` as both buyer and executor, plus a `WorkspaceResolver` whose address authority and invoice publisher are chosen by the caller. The factory records the vault against the caller and emits `WorkspaceCreated`.

The factory holds no funds and has no authority over a vault it created. Buyers can rotate the executor and guardian afterwards with `setExecutor` and `setGuardian`; the buyer address itself is immutable, which is what prevents one workspace from spending another's prefunded balance.

Without a deployed factory, the interface deploys the token, resolver, and vault directly from the visitor's wallet. The transaction count differs; the authority model does not.

## Resolver choice

A workspace may use either resolver, and the vault only pins whichever address the buyer enrolled:

| Resolver                    | Use                                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| ENSv2 Permissioned Resolver | Supplier identity on Sepolia, with Enhanced Access Control over text records and addresses |
| `WorkspaceResolver`         | Trial or non-ENS workspaces, keeping the same two-authority separation                     |

Both expose `addr(bytes32)`, which is the only call `PayeeLock` makes. Pinning happens at enrollment, so a later resolver change cannot silently redirect an invoice.

## State model

`Supplier` stores the pinned beneficiary, independent recovery signer, resolver, ENS node, beneficiary epoch, and freeze state. `Invoice` stores supplier ID, total, paid amount, beneficiary, epoch, execution nonce, and cancellation state. `reserved` equals every unpaid, non-cancelled obligation.

Enrollment is a trust ceremony. The buyer confirms the beneficiary and pins both the resolver and its current value. Changing a registry pointer later cannot silently change the vault's source of truth.

## Payment authorization

A buyer's EIP-712 payment signature covers:

```text
invoiceId · amount · beneficiary · beneficiaryEpoch · executionNonce · expiry
```

The domain adds chain ID and vault address. At execution, the contract checks the signature, current resolver value, stored beneficiary, epoch, nonce, expiry, freeze state, invoice remainder, and caller role before transferring.

## Recovery authorization

The supplier's independent recovery signer creates an EIP-712 proposal covering:

```text
supplierId · fromEpoch · toEpoch · newBeneficiary
keccak256(abi.encode(invoiceIds)) · migrationNonce · expiry
```

The buyer must submit that exact proposal. Activation requires a frozen supplier and a resolver already pointing to the proposed beneficiary. Included invoices keep their paid value, receive the new beneficiary and epoch, and increment their execution nonce. Old jobs therefore fail after recovery even if an executor retained a once-valid signature.

## Recovery monitor boundary

The recovery monitor reads the indexed supplier and recent resolver activity, then confirms current state over Sepolia RPC. It can request a pause on two implemented conditions:

- the resolver address differs from the beneficiary pinned in PayeeLock;
- an unapproved account receives additional resolver authority.

The monitor does not establish that an incident report is truthful. It does not choose a recipient, pay an invoice, migrate an obligation, unfreeze a supplier, or execute arbitrary calldata.

## Network model

The contract contains no hard-coded chain or address. It can deploy on any EVM chain with a standard ERC-20 and compatible resolver. A deployment is still intentionally chain-specific because EIP-712 signatures bind its chain ID and contract address. The verified submission instance uses Ethereum Sepolia because the ETHOnline ENSv2 beta is deployed there.

Sepolia entry points:

| Contract      | Address                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------ |
| Factory       | [`0xf768…fd15`](https://sepolia.etherscan.io/address/0xf76802b72f97c21da6d2934034061f06d0eefd15) |
| Test token    | [`0x8c92…0066`](https://sepolia.etherscan.io/address/0x8c9270053298bcfdb77a73c27f65ad9b53250066) |
| Example vault | [`0x4892…6287`](https://sepolia.etherscan.io/address/0x48926b53983Fc9b6c9433903298e1a14eD6d6287) |
| Case vault    | [`0x1590…deb6`](https://sepolia.etherscan.io/address/0x1590ee40de98affa90d748e8b5eab6fc5a8ddeb6) |

## Code map

| Path                                              | Purpose                                                      |
| ------------------------------------------------- | ------------------------------------------------------------ |
| `packages/contracts/src/PayeeLock.sol`            | Core protocol                                                |
| `packages/contracts/src/PayeeLockFactory.sol`     | Permissionless workspace creation                            |
| `packages/contracts/src/WorkspaceResolver.sol`    | Two-authority resolver without an ENSv2 dependency           |
| `packages/contracts/test/`                        | Unit, adversarial, replay, fuzz, and factory ownership cases |
| `packages/subgraph/`                              | Sepolia data sources, entities, and event mappings           |
| `tooling/recovery-monitor.ts`                     | Graph query, RPC confirmation, and optional pause request    |
| `tooling/privy-guardian.ts`                       | Policy status, denial probe, and guardian action             |
| `tooling/workspace-smoke.ts`                      | Replays the browser workspace flow against a local chain     |
| `apps/web/src/lib/payeelock-case.ts`              | Live read model for the case review                          |
| `apps/web/src/lib/wallet-client.ts`               | Injected-wallet clients and network switching                |
| `apps/web/src/components/payeelock-workspace.tsx` | Wallet-driven workspace console                              |
| `apps/web/src/components/payeelock-dashboard.tsx` | Case review, evidence, and permissions surfaces              |
