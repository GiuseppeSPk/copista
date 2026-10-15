import { describe, expect, it } from 'vitest';
import { TODAY, finishPiece } from '../../../src/voice/audio';

const ones = (n: number): Float32Array => new Float32Array(n).fill(1);

describe('the finish of a piece', () => {
  it('adds the pause for what comes next as silence after the spoken samples', () => {
    const out = finishPiece(ones(1000), 1000, 'paragraph', {
      ...TODAY,
      pauses: { ...TODAY.pauses, paragraph: 0.6 },
    });
    expect(out.length).toBe(1600);
    expect(out.subarray(0, 1000).every((v) => v === 1)).toBe(true);
    expect(out.subarray(1000).every((v) => v === 0)).toBe(true);
  });

  it('fades the last spoken samples down to nothing', () => {
    const out = finishPiece(ones(1000), 1000, 'piece', { ...TODAY, fadeMs: 15 });
    expect(out[999]).toBe(0);
    expect(out[984]).toBe(1);
    for (let i = 985; i <= 999; i++) expect(out[i]!).toBeLessThan(out[i - 1]!);
  });

  it('keeps today’s length: the spoken samples and 0.3 s, whatever follows', () => {
    for (const ends of ['piece', 'paragraph', 'heading', 'chapter'] as const) {
      expect(finishPiece(ones(44100), 44100, ends, TODAY).length).toBe(44100 + 13230);
    }
  });
});
