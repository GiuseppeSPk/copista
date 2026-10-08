// Downloads the real-world test corpus listed in tests/corpus.json into
// tests/fixtures/corpus/. Only missing files are fetched, one request every
// two seconds. Every file must be a ZIP with the recorded SHA-256.
//
//   npx tsx scripts/fetch-corpus.ts            fetch and verify; exit 1 on a mismatch
//   npx tsx scripts/fetch-corpus.ts --update   record the hash of each file in corpus.json
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';

interface CorpusEntry {
  id: string;
  source: 'standardebooks' | 'gutenberg';
  url: string;
  sha256: string;
  license: string;
}

const LIST = 'tests/corpus.json';
const DIR = 'tests/fixtures/corpus';
const USER_AGENT = 'Copista corpus test (https://github.com/GiuseppeSPk/copista)';
const DELAY_MS = 2000;
const TIMEOUT_MS = 120_000;

const update = process.argv.includes('--update');
const corpus = JSON.parse(readFileSync(LIST, 'utf8')) as CorpusEntry[];
mkdirSync(DIR, { recursive: true });

let fetched = 0;
let failures = 0;
for (const entry of corpus) {
  const path = `${DIR}/${entry.id}.epub`;
  if (!existsSync(path)) {
    if (fetched++ > 0) await sleep(DELAY_MS);
    let res: Response;
    let data: Uint8Array;
    try {
      res = await fetch(entry.url, {
        headers: { 'User-Agent': USER_AGENT },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      data = new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      console.error(`${entry.id}: ${(e as Error).message} from ${entry.url}`);
      failures++;
      continue;
    }
    if (!res.ok) {
      console.error(`${entry.id}: HTTP ${res.status} from ${entry.url}`);
      failures++;
      continue;
    }
    if (data[0] !== 0x50 || data[1] !== 0x4b) {
      console.error(`${entry.id}: not a ZIP file (${res.headers.get('content-type')})`);
      failures++;
      continue;
    }
    writeFileSync(path, data);
    console.log(`${entry.id}: downloaded ${data.length} bytes`);
  }
  const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
  if (hash === entry.sha256) continue;
  if (update) {
    console.log(`${entry.id}: sha256 ${hash}`);
    entry.sha256 = hash;
  } else {
    console.error(`${entry.id}: sha256 ${hash} does not match ${entry.sha256 || '(none)'}`);
    failures++;
  }
}

if (update) writeFileSync(LIST, JSON.stringify(corpus, null, 2) + '\n');
if (failures > 0) {
  console.error(`${failures} corpus file(s) failed`);
  process.exit(1);
}
