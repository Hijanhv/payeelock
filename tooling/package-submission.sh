#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="$repo_root/dist"
output_path="$output_dir/payeelock-submission.zip"
temporary_directory="$(mktemp -d "${TMPDIR:-/tmp}/payeelock-submission.XXXXXX")"
temporary_archive="$temporary_directory/payeelock-submission.zip"

cleanup() {
  rmdir "$temporary_directory" 2>/dev/null || true
}
trap cleanup EXIT

mkdir -p "$output_dir"

(
  cd "$repo_root"
  zip -q -r "$temporary_archive" . \
    -x '.git/*' \
    -x '.git' \
    -x '.turbo/*' \
    -x '.turbo' \
    -x '*/.turbo/*' \
    -x '*/.turbo' \
    -x '.vercel/*' \
    -x '.vercel' \
    -x 'artifacts/*' \
    -x 'artifacts' \
    -x 'apps/*/.next/*' \
    -x 'apps/*/.vercel/*' \
    -x '.runtime/*' \
    -x 'dist/*' \
    -x 'node_modules/*' \
    -x 'packages/contracts/cache/*' \
    -x 'packages/contracts/lib/*' \
    -x 'packages/contracts/out/*' \
    -x 'packages/subgraph/build/*' \
    -x 'generated/*' \
    -x 'packages/subgraph/generated/*' \
    -x 'tmp/*' \
    -x '.env*' \
    -x '*/.env*' \
    -x 'AGENTS.md' \
    -x 'CLAUDE.md' \
    -x '*.tsbuildinfo' \
    -x '.DS_Store'

  zip -q "$temporary_archive" .env.example
)

mv "$temporary_archive" "$output_path"
printf 'Created %s\n' "$output_path"
