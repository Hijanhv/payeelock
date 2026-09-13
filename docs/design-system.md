# Interface system

The interface is a single live case, not an operator console and not a fake transaction sandbox. It should make the risk and the authority split obvious before exposing protocol vocabulary.

## Product rules

- Use sentence case everywhere.
- Say buyer, supplier, invoice, old wallet, new wallet, paid, frozen, and recovered.
- Keep chain IDs, hashes, epochs, and nonces inside evidence surfaces.
- Show named chapters instead of an unexplained fraction such as “6 / 8”.
- Keep every explanation synchronized with the evidence it describes.
- Give every live claim a public receipt or current onchain read.
- Never label test infrastructure as the product.

## Active components

| File                                              | Responsibility                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `apps/web/src/components/payeelock-dashboard.tsx` | Header, mode switch, case review, invoices, evidence, permissions, and footer |
| `apps/web/src/components/payeelock-workspace.tsx` | Wallet console cards, form fields, status messages, and workspace actions     |
| `apps/web/src/components/graphics/brand.tsx`      | PayeeLock mark                                                                |
| `apps/web/src/components/graphics/icons.tsx`      | Shared interface glyphs                                                       |
| `apps/web/src/lib/payeelock-case.ts`              | Server-side Sepolia state and evidence model                                  |
| `apps/web/src/app/globals.css`                    | Tokens, layout, motion, responsiveness, and reduced-motion behavior           |

The palette is neutral paper white, near-black, and quiet gray. Manrope carries product copy and IBM Plex Mono is reserved for hashes and contract evidence. Color never substitutes for a written state label.
