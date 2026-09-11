# Architecture

PayeeLock protects the destination and replay state of an already approved business obligation. A narrowly constrained guardian may pause payments; only the supplier and buyer together can activate a replacement route.

![PayeeLock architecture](assets/architecture.svg)

## Components

| Component                   | Responsibility                                                                                               |
| --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `PayeeLock.sol`             | Prefund invoices, verify payments, pause suppliers, migrate exact invoice sets, and settle unpaid remainders |
| ENSv2 Permissioned Resolver | Separate invoice-metadata permission from payout-address authority                                           |
| The Graph Subgraph          | Index PayeeLock and resolver events for the review interface and recovery monitor                            |
| Recovery monitor            | Match indexed history against explicit pause conditions and confirm current resolver state over RPC          |
| Privy guardian              | Sign only `freeze(bytes32)` for one PayeeLock deployment under a default-deny policy                         |
| Supplier recovery signer    | Authorize the replacement beneficiary and exact invoice set                                                  |
| Buyer                       | Fund invoices, authorize payments, and accept the supplier's exact recovery proposal                         |

The Graph is evidence infrastructure, not an execution oracle. Privy's policy and PayeeLock's immutable guardian role define what the monitor may do. PayeeLock verifies payment and migration conditions again when state changes.

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

## Code map

| Path                                              | Purpose                                                   |
| ------------------------------------------------- | --------------------------------------------------------- |
| `packages/contracts/src/PayeeLock.sol`            | Core protocol                                             |
| `packages/contracts/test/PayeeLock.t.sol`         | Unit, adversarial, replay, and fuzz cases                 |
| `packages/subgraph/`                              | Sepolia data sources, entities, and event mappings        |
| `tooling/recovery-monitor.ts`                     | Graph query, RPC confirmation, and optional pause request |
| `tooling/privy-guardian.ts`                       | Policy status, denial probe, and guardian action          |
| `apps/web/src/lib/payeelock-case.ts`              | Live read model for the product UI                        |
| `apps/web/src/components/payeelock-dashboard.tsx` | Read-only case review and evidence surfaces               |
