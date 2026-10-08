import type { DrmScheme } from '../errors';
import { readText, type Zip } from './zip';

export type DrmVerdict =
  { protected: false; obfuscatedFonts: string[] } | { protected: true; scheme: DrmScheme };

/** Font obfuscation algorithms (IDPF and Adobe). They hide fonts, not text. */
const FONT_OBFUSCATION = new Set([
  'http://www.idpf.org/2008/embedding',
  'http://ns.adobe.com/pdf/enc#RC',
]);

function decodeUri(uri: string): string {
  try {
    return decodeURIComponent(uri);
  } catch {
    return uri;
  }
}

/** Applies the rules of spec section 6.4 to the META-INF files of a book. */
export function detectDrm(zip: Zip): DrmVerdict {
  if (zip.has('META-INF/rights.xml')) return { protected: true, scheme: 'adobe-adept' };
  if (zip.has('META-INF/sinf.xml')) return { protected: true, scheme: 'apple-fairplay' };

  const xml = readText(zip, 'META-INF/encryption.xml');
  if (xml === undefined) return { protected: false, obfuscatedFonts: [] };

  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    return { protected: true, scheme: 'unknown-encryption' };
  }
  const obfuscatedFonts: string[] = [];
  for (const data of doc.getElementsByTagNameNS('*', 'EncryptedData')) {
    const algorithm = data
      .getElementsByTagNameNS('*', 'EncryptionMethod')[0]
      ?.getAttribute('Algorithm');
    if (algorithm == null || !FONT_OBFUSCATION.has(algorithm.trim())) {
      return { protected: true, scheme: 'unknown-encryption' };
    }
    const uri = data.getElementsByTagNameNS('*', 'CipherReference')[0]?.getAttribute('URI');
    if (uri != null) obfuscatedFonts.push(decodeUri(uri.replace(/^\//, '')));
  }
  return { protected: false, obfuscatedFonts };
}
