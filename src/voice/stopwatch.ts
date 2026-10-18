/*
 * The voice's stopwatch, for development only: how long loading took, and
 * each model on a piece, written out for the console and the voice lab.
 */
import type { LoadTimes } from './narrator';
import type { PieceTimes } from './supertonic';

const ms = (n: number | undefined): string => `${Math.round(n ?? 0)} ms`;

export function describeLoad(times: LoadTimes): string {
  const { durationPredictor, textEncoder, vectorEstimator, vocoder } = times.sessions;
  return (
    `loaded in ${ms(times.total)}: engine ${ms(times.engine)}, ` +
    `opening vector estimator ${ms(vectorEstimator)}, vocoder ${ms(vocoder)}, ` +
    `text encoder ${ms(textEncoder)}, duration predictor ${ms(durationPredictor)}, ` +
    `warm-up ${ms(times.warmUp)}`
  );
}

/** A piece's times, and how long it took to make against how long it lasts. */
export function describePiece(times: PieceTimes, seconds: number): string {
  const took = times.durationPredictor + times.textEncoder + times.vectorEstimator + times.vocoder;
  const rtf = seconds > 0 ? (took / 1000 / seconds).toFixed(3) : '-';
  return (
    `${seconds.toFixed(2)} s made in ${ms(took)} (RTF ${rtf}): ` +
    `duration ${ms(times.durationPredictor)}, text ${ms(times.textEncoder)}, ` +
    `vector estimator ${ms(times.vectorEstimator)}, vocoder ${ms(times.vocoder)}`
  );
}
