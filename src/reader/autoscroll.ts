/** Reading paces in words per minute, finer at the slow end where moving text is read. */
export const PACES: readonly number[] = [100, 125, 150, 175, 200, 225, 250, 300, 350, 400];
export const DEFAULT_PACE = 200;

/** The pace nearest to a number, the lower one on a tie. */
export function snapPace(value: number): number {
  return PACES.reduce((best, pace) =>
    Math.abs(pace - value) < Math.abs(best - value) ? pace : best,
  );
}

/** The neighbouring pace, staying at the slowest or fastest one. */
export function stepPace(pace: number, step: 1 | -1): number {
  const at = PACES.indexOf(snapPace(pace));
  return PACES[Math.min(PACES.length - 1, Math.max(0, at + step))] ?? pace;
}

/**
 * Words in a text: runs of non-space characters, or one word per six characters
 * for scripts written without spaces, whichever is larger.
 */
export function countWords(text: string): number {
  const runs = text.match(/\S+/g);
  if (!runs) return 0;
  const characters = runs.reduce((sum, run) => sum + [...run].length, 0);
  return Math.max(runs.length, Math.ceil(characters / 6));
}

/**
 * Pixels a second that show `pace` words a minute of a chapter `height` pixels tall
 * holding `words` words, kept between a tenth of a line and three lines a second.
 */
export function pixelsPerSecond(
  pace: number,
  height: number,
  words: number,
  lineHeight: number,
): number {
  const speed = ((pace / 60) * height) / Math.max(1, words);
  return Math.min(3 * lineHeight, Math.max(lineHeight / 10, speed));
}
