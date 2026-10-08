/** The file name stem of a fixture key: `epub3Nav` → `epub3-nav`. */
export function kebab(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}
