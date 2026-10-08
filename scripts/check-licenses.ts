// Fails when any runtime package, transitive included, uses a license outside the allowlist.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'Zlib',
]);

// Packages whose package.json license field is not an SPDX id. Each entry was
// checked against the LICENSE file shipped in the package.
const VERIFIED: Record<string, string> = {
  duck: 'BSD-2-Clause',
};

interface Tree {
  dependencies?: Record<string, Tree & { path?: string }>;
}

function licenseAllowed(expression: string): boolean {
  const clean = expression.replace(/[()]/g, ' ').trim();
  if (clean.includes(' AND ')) return clean.split(' AND ').every((part) => licenseAllowed(part));
  return clean.split(' OR ').some((part) => ALLOWED.has(part.trim()));
}

function licenseOf(dir: string): string {
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
    license?: string | { type?: string };
    licenses?: Array<{ type?: string }>;
  };
  if (typeof pkg.license === 'string') return pkg.license;
  if (pkg.license?.type) return pkg.license.type;
  if (pkg.licenses?.length) return pkg.licenses.map((l) => l.type ?? '').join(' OR ');
  return 'UNKNOWN';
}

function main(): void {
  const json = execFileSync('npm', ['ls', '--omit=dev', '--all', '--json', '--long'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
    maxBuffer: 64 * 1024 * 1024,
  });
  const root = JSON.parse(json) as Tree;
  const seen = new Map<string, string>();
  const walk = (tree: Tree): void => {
    for (const [name, child] of Object.entries(tree.dependencies ?? {})) {
      if (child.path && !seen.has(child.path)) {
        seen.set(child.path, `${name}: ${VERIFIED[name] ?? licenseOf(child.path)}`);
        walk(child);
      }
    }
  };
  walk(root);
  const bad = [...seen.values()].filter((entry) => !licenseAllowed(entry.split(': ')[1] ?? ''));
  if (bad.length > 0) {
    console.error(`Licenses outside the allowlist:\n${bad.join('\n')}`);
    process.exit(1);
  }
  console.log(`${seen.size} runtime packages, all licenses allowed.`);
}

main();
