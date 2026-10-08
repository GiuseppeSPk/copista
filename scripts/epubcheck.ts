// Writes the engine's EPUB outputs (scripts/write-outputs.ts) and validates
// each one with the W3C EPUBCheck. Exits 1 on any ERROR or FATAL message.
//
//   npx tsx scripts/epubcheck.ts            fixtures only
//   npx tsx scripts/epubcheck.ts --corpus   also every downloaded corpus book
//
// Java 11+ must be on PATH, or JAVA_HOME must point to it.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { unzipSync } from 'fflate';
import { OUTPUT_DIR, writeOutputs } from './write-outputs';

const VERSION = '5.4.0';
const SHA256 = '33350c61038e71dfb3d45a76aed04bf5481e6d5500cb780f6e98db8bbd15a28c';
const URL = `https://github.com/w3c/epubcheck/releases/download/v${VERSION}/epubcheck-${VERSION}.zip`;
const CACHE = join('.cache', 'epubcheck');
const JAR = join(CACHE, `epubcheck-${VERSION}`, 'epubcheck.jar');

interface Message {
  ID: string;
  severity: string;
  message: string;
  locations?: Array<{ path?: string; line?: number; column?: number }>;
}

function javaCommand(): string {
  const home = process.env.JAVA_HOME;
  const fromHome = home !== undefined && home !== '' ? join(home, 'bin', 'java') : undefined;
  for (const candidate of [fromHome, 'java']) {
    if (candidate === undefined) continue;
    const probe = spawnSync(candidate, ['-version'], { encoding: 'utf8' });
    const match = /version "(\d+)/.exec(`${probe.stderr ?? ''}${probe.stdout ?? ''}`);
    if (probe.status === 0 && match !== null && Number(match[1]) >= 11) return candidate;
  }
  console.error('Java 11+ is required: install it, or set JAVA_HOME.');
  process.exit(1);
}

async function ensureJar(): Promise<void> {
  if (existsSync(JAR)) return;
  console.log(`Downloading EPUBCheck ${VERSION}`);
  const res = await fetch(URL, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`EPUBCheck download failed: HTTP ${res.status}`);
  const zip = new Uint8Array(await res.arrayBuffer());
  const hash = createHash('sha256').update(zip).digest('hex');
  if (hash !== SHA256)
    throw new Error(`EPUBCheck download has SHA-256 ${hash}, expected ${SHA256}`);
  for (const [path, data] of Object.entries(unzipSync(zip))) {
    if (path.endsWith('/')) continue;
    const target = join(CACHE, path);
    mkdirSync(join(target, '..'), { recursive: true });
    writeFileSync(target, data);
  }
}

const java = javaCommand();
await ensureJar();
const count = await writeOutputs(process.argv.includes('--corpus'));
console.log(`Checking ${count} EPUB files with EPUBCheck ${VERSION}`);

const reports = join(CACHE, 'reports');
mkdirSync(reports, { recursive: true });
let failed = 0;
for (const file of readdirSync(OUTPUT_DIR)
  .filter((f) => f.endsWith('.epub'))
  .sort()) {
  const name = file.replace(/\.epub$/, '');
  const report = join(reports, `${name}.json`);
  spawnSync(java, ['-jar', JAR, join(OUTPUT_DIR, file), '--json', report, '--locale', 'en'], {
    encoding: 'utf8',
  });
  if (!existsSync(report)) {
    console.log(`${name}: EPUBCheck wrote no report`);
    failed++;
    continue;
  }
  const messages = (JSON.parse(readFileSync(report, 'utf8')) as { messages: Message[] }).messages;
  const errors = messages.filter((m) => m.severity === 'ERROR' || m.severity === 'FATAL');
  const warnings = messages.filter((m) => m.severity === 'WARNING');
  console.log(`${name}: ${errors.length} errors, ${warnings.length} warnings`);
  for (const m of [...errors, ...warnings]) {
    const where = (m.locations ?? [])
      .slice(0, 3)
      .map((l) => `${l.path ?? ''}:${l.line ?? ''}:${l.column ?? ''}`)
      .join(', ');
    console.log(`  ${m.severity} ${m.ID} ${m.message.slice(0, 300)} [${where}]`);
  }
  if (errors.length > 0) failed++;
}
if (failed > 0) {
  console.error(`${failed} file(s) failed EPUBCheck`);
  process.exit(1);
}
