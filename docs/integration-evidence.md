# Integration evidence

## ENSv2

The verified case uses the official ENSv2 Sepolia registry and a Permissioned Resolver deployed from the official ENSv2 contracts.

| Evidence                           | Receipt                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Register `payeelock-sentinel.eth`  | [`0x2c53…4677`](https://sepolia.etherscan.io/tx/0x2c53727216ed3481011fe366352ac80ec2a24ed5dfd35b4db70da5ae82c64677) |
| Deploy Permissioned Resolver       | [`0x5e18…2a71`](https://sepolia.etherscan.io/tx/0x5e188da7a83854b01d016ebd730eb5bb9cc84664276fda7a306bfc4370062a71) |
| Grant invoice-publisher role       | [`0x1b84…0f43`](https://sepolia.etherscan.io/tx/0x1b8483e98fb5b436f2bd41cb4330e2eeb2d0979fede2b0d1e68e750af8170f43) |
| Publisher writes permitted text    | [`0x6cc0…e93e`](https://sepolia.etherscan.io/tx/0x6cc0e0979f05b604d617bd33d4444f0bd57b75039d5b7a593cc3655fd224e93e) |
| Publisher address write reverts    | [`0xa3db…e2f`](https://sepolia.etherscan.io/tx/0xa3db580bb36276d31eaefb610862ec72aa56863250213f0c58cca71ebad0ae2f)  |
| Recovery authority changes address | [`0x4e1c…f670`](https://sepolia.etherscan.io/tx/0x4e1c882dedf134d890da3230d8a52a2854087a38f8e43c6efbe06aaa7c97f670) |

The vault pins resolver `0x2368D210C506de631780863062C48c75695e06F9` and node `0x9099…d2a`. The publisher can maintain invoice metadata without inheriting authority over payout routing.

## Privy

Privy server wallet `0x41A23e86B410C28A02594F12a9DEFE28B22a6B9e` is the PayeeLock guardian. Policy `zo1ni6iiy0e6297vraqbbgad` allows only:

```text
chain:     eip155:11155111
recipient: 0x1590ee40de98affa90d748e8b5eab6fc5a8ddeb6
function:  freeze(bytes32)
default:   deny
```

The guardian successfully paused Harbor Systems in [transaction `0x9ecb…c0b8`](https://sepolia.etherscan.io/tx/0x9ecb6a758e604e9416f0af6d67775df762b0707f10ba84205610967da304c0b8). A separate one-wei ETH transfer probe is rejected by Privy before broadcast.

```bash
npm run guardian:status
npm run guardian:policy-test
```

## The Graph

The Subgraph indexes PayeeLock suppliers, invoices, payments, freezes, migrations, cancellations, executor changes, guardian changes, and ENSv2 address, text, and role events.

```bash
npm run graph:build
graph auth <deploy-key>
npm run graph:deploy
```

Version `0.1.0` is live in [Subgraph Studio](https://thegraph.com/studio/subgraph/payeelock-sentinel/) as deployment `Qmf77WPhPd2nLhUMczuu2eGV2PfqNhXGfdiXopgBnQaLhG`. At verification it had indexed one supplier, three invoices, 13 PayeeLock events, and 9 ENS events through Sepolia block `11,685,945` with no indexing errors.

`tooling/recovery-monitor.ts` queries the indexed supplier and resolver activity, then confirms the current resolver and vault state over RPC. It either reports that no pause condition matched, returns the matching evidence, or asks the constrained Privy guardian to submit `freeze(bytes32)` when run with `--execute`.

```bash
npm run monitor:inspect
npm run monitor:execute
```

The public app queries the endpoint server-side and does not expose it in rendered HTML. The Graph supplies live audit history; direct RPC reads and contract checks remain authoritative for state changes.
