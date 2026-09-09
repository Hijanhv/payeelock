#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v forge >/dev/null || { echo 'Install Foundry from https://getfoundry.sh, then run this script again.'; exit 1; }
contracts_root="packages/contracts"
mkdir -p "$contracts_root/lib"
if [ ! -d "$contracts_root/lib/openzeppelin-contracts" ]; then
  git clone --depth 1 --branch v5.4.0 https://github.com/OpenZeppelin/openzeppelin-contracts.git "$contracts_root/lib/openzeppelin-contracts"
fi
if [ ! -d "$contracts_root/lib/forge-std" ]; then
  git clone --depth 1 --branch v1.9.7 https://github.com/foundry-rs/forge-std.git "$contracts_root/lib/forge-std"
fi
test "$(git -C "$contracts_root/lib/openzeppelin-contracts" rev-parse HEAD)" = c64a1edb67b6e3f4a15cca8909c9482ad33a02b0 || { echo 'Unexpected OpenZeppelin revision; inspect packages/contracts/lib before continuing.'; exit 1; }
test "$(git -C "$contracts_root/lib/forge-std" rev-parse HEAD)" = 77041d2ce690e692d6e03cc812b57d1ddaa4d505 || { echo 'Unexpected forge-std revision; inspect packages/contracts/lib before continuing.'; exit 1; }
npm ci
npm run contracts:build
