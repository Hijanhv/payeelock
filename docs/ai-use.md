# AI-use disclosure

I used ChatGPT and Codex as development tools during ETHOnline 2026. They helped me research sponsor requirements, compare architecture options, draft and review Solidity and TypeScript changes, expand tests, tighten interface copy, create first-pass SVG diagrams, organize documentation, and automate browser capture and video editing.

The assisted areas include:

- `packages/contracts/`: contract review, edge-case coverage, typed-data helpers, and test drafting;
- `packages/subgraph/`: schema and mapping review;
- `tooling/`: deployment, recovery-monitor, Privy-policy, lifecycle-test, repository-audit, and packaging scripts;
- `apps/web/`: the case-review interface, the wallet-driven workspace console, copy, wallet client, and responsive styling;
- `docs/` and `README.md`: structure, editing, diagrams, validation records, and submission copy.

I directed the product scope and recovery model, chose the final architecture and integrations, reviewed the generated changes, ran the tests, controlled the external accounts, and verified the Sepolia, Privy, Graph, and Vercel evidence. No AI model runs inside PayeeLock. The recovery monitor uses explicit indexed-history and RPC checks; it does not use an LLM or make autonomous recovery decisions.

The submitted demo will use the builder's own narration. Synthetic narration was used locally only as an editing and timing preview and will not be uploaded to ETHGlobal.

I did not use a formal spec-driven development workflow such as OpenSpec, Kiro, or spec-kit.
