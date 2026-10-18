import { describe, expect, it } from 'vitest';
import { describeLoad, describePiece } from '../../../src/voice/stopwatch';

describe('the stopwatch', () => {
  it('writes out how long loading took', () => {
    expect(
      describeLoad({
        engine: 120.4,
        sessions: { vectorEstimator: 900, vocoder: 300, textEncoder: 50.6, durationPredictor: 10 },
        warmUp: 700,
        total: 2100,
      }),
    ).toBe(
      'loaded in 2100 ms: engine 120 ms, opening vector estimator 900 ms, vocoder 300 ms, ' +
        'text encoder 51 ms, duration predictor 10 ms, warm-up 700 ms',
    );
  });

  it('writes out a piece, with how long it took against how long it lasts', () => {
    expect(
      describePiece(
        { durationPredictor: 5, textEncoder: 15, vectorEstimator: 400, vocoder: 80 },
        2,
      ),
    ).toBe(
      '2.00 s made in 500 ms (RTF 0.250): duration 5 ms, text 15 ms, ' +
        'vector estimator 400 ms, vocoder 80 ms',
    );
  });

  it('gives no ratio for a piece with no sound', () => {
    expect(
      describePiece({ durationPredictor: 0, textEncoder: 0, vectorEstimator: 0, vocoder: 0 }, 0),
    ).toContain('RTF -');
  });
});
