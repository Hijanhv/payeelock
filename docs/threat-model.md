# Threat model

The intended attacker controls a supplier's invoice-publishing account, old payout wallet, or queued payment job. They do not simultaneously control both the buyer and the independently enrolled recovery signer.

## Enforced boundaries

| Attempt                                      | Enforcement                                                          |
| -------------------------------------------- | -------------------------------------------------------------------- |
| Publisher changes payout address             | ENSv2 scoped roles reject the write                                  |
| Resolver returns a different beneficiary     | Monitor may request a pause; PayeeLock independently rejects payment |
| Unapproved account gains resolver authority  | Indexed role event matches a deterministic freeze condition          |
| Guardian tries to transfer funds             | Privy default-deny policy rejects the action before broadcast        |
| Guardian calls another PayeeLock function    | Privy ABI rule permits only `freeze(bytes32)`                        |
| Old payment runs during recovery             | Supplier freeze is checked at execution                              |
| Old payment runs after recovery              | Beneficiary epoch and execution nonce are stale                      |
| Supplier redirects alone                     | Buyer must submit the exact signed migration                         |
| Buyer substitutes a recipient or invoice     | Supplier signature binds both values                                 |
| Signature crosses a chain or deployment      | EIP-712 domain binds chain ID and vault address                      |
| Duplicate or excess payment                  | Nonce and unpaid-remainder checks revert                             |
| Fee-on-transfer asset underfunds either side | Exact token balance deltas are required                              |

## Monitor and guardian safety

The recovery monitor never receives arbitrary transaction authority. Its code constructs one ABI-encoded call from a configured supplier ID. Privy independently restricts chain, destination contract, and function. PayeeLock independently restricts the guardian role to freezing.

The Graph provides indexed evidence, not same-block finality. Current Sepolia RPC state is checked before a pause request, and the vault repeats beneficiary checks when funds move. The monitor does not infer whether an incident report is truthful.

## Limits

- The contract is unaudited and not ready for production funds.
- The buyer may cancel and recover an unpaid remainder; this is payable escrow, not guaranteed supplier credit.
- A transfer finalized before the freeze cannot be recovered.
- A compromised guardian can deny service by freezing, but cannot redirect or withdraw funds.
- A compromised recovery signer and buyer together can redirect unpaid invoices.
- Organizational independence of buyer and recovery signer is verified offchain at enrollment.
- Resolver and recovery-signer rotation are not implemented.
- Only standard non-rebasing ERC-20 behavior is supported.
- Direct token donations have no withdrawal path.
- Subgraph lag may delay detection; contract checks remain the last line of defense.

Tests prove implemented cases. They are not a substitute for an audit.
