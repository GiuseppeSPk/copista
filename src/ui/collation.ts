import type { Collation, Part } from '../core/convert/census';
import type { OutputFormat } from '../rooms/scriptorium';

/** One line of the collation: what was counted, how much arrived, and why some did not. */
export interface CollationRow {
  label: string;
  value: string;
  lost: boolean;
  reason?: string;
  /** Words the copy lacks, shown so the reader can look for them. */
  missing?: string[];
}

const PART_LABELS: Record<Part, string> = {
  headings: 'Headings',
  notes: 'Note links',
  images: 'Pictures',
  tables: 'Tables',
  links: 'Web links',
  emphasis: 'Italic and bold',
};

const SAME_NOTE_NUMBERS = 'The note numbers stay in the text, but no longer jump to the note.';

/** Why a format leaves a part behind, where the converter does it on purpose. */
const REASONS: Partial<Record<OutputFormat, Partial<Record<Part, string>>>> = {
  docx: {
    notes: SAME_NOTE_NUMBERS,
    tables: 'Each table row becomes a paragraph, its cells set apart by bars.',
    links: 'The words of each link stay; the web address is left out.',
    images: 'Drawings (SVG) and pictures in forms Word cannot take are left out.',
  },
  md: {
    notes: SAME_NOTE_NUMBERS,
    images: 'Markdown keeps text only: each picture becomes a label with its description.',
  },
};

const number = (n: number): string => n.toLocaleString('en-GB');

/**
 * The rows the Done leg shows after a copy is checked. A part the copy has more of than the
 * original (a heading added for an untitled chapter) counts as all there.
 */
export function collationRows(
  collation: Collation,
  target: OutputFormat,
  /** Why parts are missing that the reader chose to leave out. */
  chosen: Partial<Record<Part, string>> = {},
): CollationRow[] {
  const { total, found, missing } = collation.words;
  const rows: CollationRow[] = [
    found === total
      ? { label: 'Words', value: `All ${number(total)}`, lost: false }
      : {
          label: 'Words',
          value: `${number(found)} of ${number(total)}`,
          lost: true,
          missing,
        },
  ];
  for (const { part, original, copy } of collation.parts ?? []) {
    const kept = Math.min(original, copy);
    const reason = chosen[part] ?? REASONS[target]?.[part];
    rows.push({
      label: PART_LABELS[part],
      value:
        kept === original ? `All ${number(original)}` : `${number(kept)} of ${number(original)}`,
      lost: kept < original,
      ...(kept < original && reason ? { reason } : {}),
    });
  }
  return rows;
}

/** A line under the rows for plain text, which holds words alone by design. */
export function collationNote(target: OutputFormat): string | undefined {
  return target === 'txt'
    ? 'Plain text holds words only: headings, notes and pictures become plain lines.'
    : undefined;
}
