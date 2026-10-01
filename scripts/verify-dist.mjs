/**
 * Checks that what the libraries would actually publish works when installed.
 *
 * `publishConfig` redirects each package's entry points to `dist`, which nothing
 * imports during development, so a broken emit stays invisible until the first person
 * installs the package. Importing `dist` from inside the workspace does not catch it
 * either: the workspace `exports` still point at TypeScript source, so a built package
 * would load its dependencies from `src` and pass against a combination that never
 * exists anywhere.
 *
 * So this packs each library, extracts the tarballs into a throwaway `node_modules`,
 * and loads them the way a consumer would. The bytes under test are the bytes that
 * would be published, with `publishConfig` already applied by the packer.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const scratch = join(tmpdir(), 'rationauts-verify-dist');

/** Exports a consumer would reasonably expect to find. */
const PACKAGES = [
  { name: 'core', expect: ['step', 'createWorld', 'parseMap', 'makeRng'] },
  { name: 'agents', expect: ['aStarSearch', 'uniformCostSearch', 'PriorityQueue'] },
  { name: 'sim', expect: ['createRun', 'runScenario', 'parseReplay', 'SCENARIOS'] },
];

let failures = 0;
const fail = (message) => {
  console.error(`FAIL ${message}`);
  failures++;
};
const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

rmSync(scratch, { recursive: true, force: true });
mkdirSync(join(scratch, 'node_modules', '@rationauts'), { recursive: true });

for (const { name } of PACKAGES) {
  const packageDir = join(root, 'packages', name);
  const output = run('pnpm', ['pack', '--pack-destination', scratch], packageDir);
  const tarball = output.trim().split('\n').at(-1);
  if (tarball === undefined || !existsSync(tarball)) {
    fail(`${name}: pnpm pack produced no tarball`);
    continue;
  }

  const target = join(scratch, 'node_modules', '@rationauts', name);
  mkdirSync(target, { recursive: true });
  run('tar', ['-xzf', tarball, '-C', target, '--strip-components', '1'], scratch);

  const manifest = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8'));
  const entry = manifest.exports?.['.'];
  const importPath = typeof entry === 'string' ? entry : entry?.import;
  const typesPath = typeof entry === 'string' ? undefined : entry?.types;

  if (importPath === undefined || !importPath.startsWith('./dist/')) {
    fail(`${name}: packed exports point at ${String(importPath)}, expected ./dist/`);
    continue;
  }
  if (typesPath === undefined || !existsSync(join(target, typesPath))) {
    fail(`${name}: packed types ${String(typesPath)} are missing`);
    continue;
  }
  if (!existsSync(join(target, importPath))) {
    fail(`${name}: packed entry ${importPath} is missing`);
    continue;
  }
  console.log(`ok   @rationauts/${name}: packed, exports ${importPath}`);
}

// Load the packed packages the way a consumer would, from outside the workspace.
const probe = join(scratch, 'probe.mjs');
writeFileSync(
  probe,
  PACKAGES.map(
    ({ name, expect }) => `
import * as ${name} from '@rationauts/${name}';
for (const key of ${JSON.stringify(expect)}) {
  if (${name}[key] === undefined) {
    console.error('missing export @rationauts/${name}.' + key);
    process.exitCode = 1;
  }
}`,
  ).join('\n') + `\nconsole.log('imports ok');\n`,
);

try {
  const output = run('node', [probe], scratch);
  if (!output.includes('imports ok')) fail('packed packages did not import cleanly');
  else console.log('ok   all three import from a consumer-shaped node_modules');
} catch (cause) {
  fail(`packed packages failed to import:\n${cause.stderr ?? cause.message}`);
}

// The published bin is compiled JavaScript, so run it the way npm would.
try {
  const bin = join(scratch, 'node_modules', '@rationauts', 'sim', 'dist', 'cli.js');
  const output = run('node', [bin, 'list'], scratch);
  if (!output.includes('open-field')) fail('sim: packed CLI produced unexpected output');
  else console.log('ok   @rationauts/sim: packed CLI runs');
} catch (cause) {
  fail(`sim: packed CLI failed:\n${cause.stderr ?? cause.message}`);
}

rmSync(scratch, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\npublished layout verified');
