import { access, readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set([
  '.git',
  '.runtime',
  '.turbo',
  '.vercel',
  'apps/web/.next',
  'artifacts',
  'dist',
  'node_modules',
  'packages/contracts/cache',
  'packages/contracts/lib',
  'packages/contracts/out',
  'packages/subgraph/build',
  'packages/subgraph/generated',
  'tmp',
]);
const conventionalRootFiles = new Set(['AGENTS.md', 'CLAUDE.md', 'LICENSE', 'README.md']);
const stalePaths = [
  'contracts',
  'next.config.ts',
  'public',
  'scripts',
  'src',
  'subgraph',
  'apps/web/public/.well-known/agent-registration.json',
  'apps/web/public/agent-mark.svg',
  'tooling/erc8004-agent.ts',
  'tooling/sentinel-agent.ts',
  'apps/web/src/components/sentinel-dashboard.tsx',
  'apps/web/src/lib/sentinel-case.ts',
];
const markdownFiles: string[] = [];
const problems: string[] = [];
const kebabName = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+)*$/;

function normalize(filePath: string) {
  return filePath.split(path.sep).join('/');
}

function isIgnored(relativePath: string) {
  return [...ignoredDirectories].some(
    (ignored) => relativePath === ignored || relativePath.startsWith(`${ignored}/`),
  );
}

function usesEcosystemName(relativePath: string) {
  return (
    conventionalRootFiles.has(relativePath) ||
    /^packages\/contracts\/src\/[A-Z][A-Za-z0-9]*\.sol$/.test(relativePath) ||
    /^packages\/contracts\/test\/[A-Z][A-Za-z0-9]*\.t\.sol$/.test(relativePath) ||
    /^packages\/subgraph\/abis\/[A-Z][A-Za-z0-9]*\.json$/.test(relativePath)
  );
}

async function walk(directory: string): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  const relativeDirectory = normalize(path.relative(root, directory));

  if (directory !== root && entries.length === 0) {
    problems.push(`empty directory: ${relativeDirectory}`);
  }

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = normalize(path.relative(root, absolutePath));
    if (isIgnored(relativePath)) continue;

    if (entry.isDirectory()) {
      if (!entry.name.startsWith('.') && !kebabName.test(entry.name)) {
        problems.push(`directory is not kebab-case: ${relativePath}`);
      }
      await walk(absolutePath);
      continue;
    }

    if (
      !entry.name.startsWith('.') &&
      !usesEcosystemName(relativePath) &&
      !kebabName.test(entry.name)
    ) {
      problems.push(`file is not kebab-case: ${relativePath}`);
    }

    if ((await stat(absolutePath)).size === 0) problems.push(`empty file: ${relativePath}`);
    if (entry.name.endsWith('.md')) markdownFiles.push(relativePath);
  }
}

async function checkLocalLinks(markdownPath: string) {
  const content = await readFile(path.join(root, markdownPath), 'utf8');
  const links = [
    ...content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g),
    ...content.matchAll(/(?:href|src)="([^"]+)"/g),
  ].map((match) => match[1]);

  for (const rawLink of links) {
    if (!rawLink || /^(?:[a-z]+:|#)/i.test(rawLink)) continue;
    const link = decodeURIComponent(rawLink.replace(/^<|>$/g, '').split(/[?#]/, 1)[0]);
    const target = link.startsWith('/')
      ? path.join(root, link.slice(1))
      : path.resolve(root, path.dirname(markdownPath), link);
    try {
      await access(target);
    } catch {
      problems.push(`broken local link in ${markdownPath}: ${rawLink}`);
    }
  }
}

async function checkDeploymentMetadata() {
  const proof = JSON.parse(
    await readFile(path.join(root, 'deployments/sepolia-proof.json'), 'utf8'),
  ) as {
    contracts: { payeeLock: string; mockUsdc: string; ensV2PermissionedResolver: string };
    identity: { guardian: string };
    actors: { newBeneficiary: string };
    transactions: { payeeLockDeployment: string };
  };
  const deploymentPath = `deployments/sepolia-${proof.contracts.payeeLock.toLowerCase()}.json`;
  const deployment = JSON.parse(await readFile(path.join(root, deploymentPath), 'utf8')) as {
    address: string;
    asset: string;
    guardian: string;
    hash: string;
    block: string;
  };
  const envExample = await readFile(path.join(root, '.env.example'), 'utf8');
  const subgraphPath = 'packages/subgraph/subgraph.yaml';
  const subgraph = await readFile(path.join(root, subgraphPath), 'utf8');
  const expectedEnv = {
    NEXT_PUBLIC_PAYEELOCK_ADDRESS: proof.contracts.payeeLock,
    SEPOLIA_ENS_RESOLVER_ADDRESS: proof.contracts.ensV2PermissionedResolver,
    SEPOLIA_GUARDIAN_ADDRESS: proof.identity.guardian,
    SEPOLIA_NEW_BENEFICIARY_ADDRESS: proof.actors.newBeneficiary,
  };

  for (const [name, expected] of Object.entries(expectedEnv)) {
    const actual = envExample.match(new RegExp(`^${name}=(.+)$`, 'm'))?.[1];
    if (actual?.toLowerCase() !== expected.toLowerCase()) {
      problems.push(`deployment metadata mismatch: ${name} in .env.example`);
    }
  }

  const deploymentChecks = [
    ['address', deployment.address, proof.contracts.payeeLock],
    ['asset', deployment.asset, proof.contracts.mockUsdc],
    ['guardian', deployment.guardian, proof.identity.guardian],
    ['hash', deployment.hash, proof.transactions.payeeLockDeployment],
  ];
  for (const [field, actual, expected] of deploymentChecks) {
    if (actual.toLowerCase() !== expected.toLowerCase()) {
      problems.push(`deployment metadata mismatch: ${field} in ${deploymentPath}`);
    }
  }

  if (!subgraph.toLowerCase().includes(proof.contracts.payeeLock.toLowerCase())) {
    problems.push(`deployment metadata mismatch: PayeeLock address in ${subgraphPath}`);
  }
  if (!subgraph.toLowerCase().includes(proof.contracts.ensV2PermissionedResolver.toLowerCase())) {
    problems.push(`deployment metadata mismatch: resolver address in ${subgraphPath}`);
  }
  if (!subgraph.includes(`startBlock: ${deployment.block}`)) {
    problems.push(`deployment metadata mismatch: PayeeLock start block in ${subgraphPath}`);
  }
}

async function checkWorkspaceLayout() {
  const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
    workspaces?: string[];
  };
  const expectedWorkspaces = ['apps/*', 'packages/*'];
  if (JSON.stringify(packageJson.workspaces) !== JSON.stringify(expectedWorkspaces)) {
    problems.push('package.json must declare the apps/* and packages/* workspaces');
  }

  for (const requiredPath of [
    'apps/web/package.json',
    'apps/web/next.config.ts',
    'packages/contracts/package.json',
    'packages/contracts/foundry.toml',
    'packages/subgraph/package.json',
    'packages/subgraph/subgraph.yaml',
    'tooling/package-submission.sh',
    'turbo.json',
  ]) {
    try {
      await access(path.join(root, requiredPath));
    } catch {
      problems.push(`missing workspace boundary file: ${requiredPath}`);
    }
  }
}

async function checkLocalEnvironment() {
  try {
    const contents = await readFile(path.join(root, '.env.local'), 'utf8');
    const names = contents
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => line.slice(0, line.indexOf('=')));
    const seen = new Set<string>();
    for (const name of names) {
      if (seen.has(name)) problems.push(`duplicate variable in .env.local: ${name}`);
      seen.add(name);
      if (name.startsWith('SENTINEL_')) {
        problems.push(`retired variable name in .env.local: ${name}`);
      }
    }
  } catch {
    // A clean checkout is not expected to have a local secret file.
  }
}

await walk(root);
await checkDeploymentMetadata();
await checkLocalEnvironment();
await checkWorkspaceLayout();

for (const stalePath of stalePaths) {
  try {
    await access(path.join(root, stalePath));
    problems.push(`retired product file still exists: ${stalePath}`);
  } catch {
    // Its absence is the expected state.
  }
}

await Promise.all(markdownFiles.map(checkLocalLinks));

if ((await readFile(path.join(root, 'CLAUDE.md'), 'utf8')).trim() !== '@AGENTS.md') {
  problems.push('CLAUDE.md must remain a pointer to the canonical AGENTS.md instructions');
}

if (problems.length > 0) {
  console.error(problems.map((problem) => `- ${problem}`).join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `Repository check passed: three workspace boundaries, ${markdownFiles.length} Markdown files, consistent deployment metadata, and no empty source paths, stale product files, naming violations, or broken local links.`,
  );
}
