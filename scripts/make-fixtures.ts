/** Writes every fixture to tests/fixtures/generated/ for manual and EPUBCheck runs. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { bigEpub, DOCX, EPUB, OTHER } from '../tests/fixtures/catalog';

const OUT = join('tests', 'fixtures', 'generated');

function kebab(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

mkdirSync(OUT, { recursive: true });
const groups: Array<[Record<string, () => Uint8Array>, string]> = [
  [EPUB, 'epub'],
  [DOCX, 'docx'],
  [OTHER, 'bin'],
  [{ bigEpub }, 'epub'],
];
let count = 0;
for (const [group, extension] of groups) {
  for (const [key, build] of Object.entries(group)) {
    writeFileSync(join(OUT, `${kebab(key)}.${extension}`), build());
    count++;
  }
}
console.log(`Wrote ${count} fixtures to ${OUT}`);
