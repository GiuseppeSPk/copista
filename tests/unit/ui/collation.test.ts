import { describe, expect, it } from 'vitest';
import type { Collation } from '../../../src/core/convert/census';
import { collationNote, collationRows } from '../../../src/ui/collation';

describe('collation rows', () => {
  it('says every word and part arrived when nothing is lost', () => {
    const collation: Collation = {
      words: { total: 1200, found: 1200, missing: [] },
      parts: [{ part: 'headings', original: 3, copy: 3 }],
    };
    expect(collationRows(collation, 'epub')).toEqual([
      { label: 'Words', value: 'All 1,200', lost: false },
      { label: 'Headings', value: 'All 3', lost: false },
    ]);
  });

  it('names the missing words and the reason a format drops a part', () => {
    const collation: Collation = {
      words: { total: 10, found: 8, missing: ['whale', 'sea'] },
      parts: [
        { part: 'notes', original: 4, copy: 0 },
        { part: 'emphasis', original: 2, copy: 1 },
      ],
    };
    expect(collationRows(collation, 'docx')).toEqual([
      { label: 'Words', value: '8 of 10', lost: true, missing: ['whale', 'sea'] },
      {
        label: 'Note links',
        value: '0 of 4',
        lost: true,
        reason: 'The note numbers stay in the text, but no longer jump to the note.',
      },
      { label: 'Italic and bold', value: '1 of 2', lost: true },
    ]);
  });

  it('counts a part the copy has more of as all there', () => {
    const collation: Collation = {
      words: { total: 1, found: 1, missing: [] },
      parts: [{ part: 'headings', original: 1, copy: 2 }],
    };
    expect(collationRows(collation, 'md')[1]).toEqual({
      label: 'Headings',
      value: 'All 1',
      lost: false,
    });
  });

  it('explains plain text once instead of listing its parts', () => {
    expect(collationRows({ words: { total: 2, found: 2, missing: [] } }, 'txt')).toHaveLength(1);
    expect(collationNote('txt')).toMatch(/words only/);
    expect(collationNote('epub')).toBeUndefined();
  });
});
