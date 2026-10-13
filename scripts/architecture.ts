import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';

/**
 * Layer rules for src/. Layers depend downward only:
 * core <- reader, storage, voice <- rooms/<room>. Rooms never import each other,
 * and only src/ui/ may import svelte.
 */
const LAYERS: Record<string, string[]> = {
  core: ['core'],
  reader: ['core', 'reader'],
  storage: ['core', 'storage'],
  voice: ['core', 'voice'],
  rooms: ['core', 'reader', 'storage', 'voice'],
};

const IMPORT_PATTERNS = [
  /\bimport\s[^'"]*?\sfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bexport\s[^'"]*?\sfrom\s*['"]([^'"]+)['"]/g,
];

function specifiers(source: string): string[] {
  const found: string[] = [];
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) found.push(match[1]);
    }
  }
  return found;
}

/** The layer of a path under src/: "core", "reader", "storage", "rooms/<x>", "ui" or "". */
function layerOf(path: string): string {
  const parts = path.split('/');
  if (parts[0] !== 'src') return '';
  const top = parts[1] ?? '';
  if (top === 'rooms') return parts.length > 3 ? `rooms/${parts[2]}` : 'rooms';
  return parts.length > 2 ? top : '';
}

function allowed(from: string, to: string): boolean {
  if (from === to) return true;
  if (from === 'ui') return true;
  const base = from.startsWith('rooms/') ? 'rooms' : from;
  const permitted = LAYERS[base];
  if (permitted === undefined) return true;
  return permitted.includes(to);
}

export function findViolations(files: Record<string, string>): string[] {
  const violations: string[] = [];
  for (const [file, source] of Object.entries(files)) {
    const path = file.replace(/\\/g, '/');
    const from = layerOf(path);
    for (const spec of specifiers(source)) {
      if (spec === 'svelte' || spec.startsWith('svelte/')) {
        if (from !== 'ui') violations.push(`${path}: imports ${spec} outside src/ui/`);
        continue;
      }
      if (!spec.startsWith('.')) continue;
      const target = posix.normalize(posix.join(posix.dirname(path), spec));
      const to = layerOf(target);
      if (!allowed(from, to)) {
        violations.push(`${path}: ${from} may not import ${to || target} (${spec})`);
      }
    }
  }
  return violations;
}

export function readSourceTree(dir: string): Record<string, string> {
  const files: Record<string, string> = {};
  const walk = (current: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|svelte)$/.test(name)) {
        files[full.replace(/\\/g, '/')] = readFileSync(full, 'utf8');
      }
    }
  };
  walk(dir);
  return files;
}
