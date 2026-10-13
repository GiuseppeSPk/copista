import { describe, expect, it } from 'vitest';
import {
  countWords,
  DEFAULT_PACE,
  PACES,
  pixelsPerSecond,
  snapPace,
  stepPace,
} from '../../../src/reader/autoscroll';

describe('autoscroll pace', () => {
  it('offers ten paces from 100 to 400 words a minute, 200 by default', () => {
    expect(PACES).toEqual([100, 125, 150, 175, 200, 225, 250, 300, 350, 400]);
    expect(DEFAULT_PACE).toBe(200);
  });

  it('snaps any number to the nearest pace', () => {
    expect(snapPace(210)).toBe(200);
    expect(snapPace(0)).toBe(100);
    expect(snapPace(999)).toBe(400);
    expect(snapPace(280)).toBe(300);
  });

  it('steps to the neighbouring pace and stops at the ends', () => {
    expect(stepPace(250, 1)).toBe(300);
    expect(stepPace(250, -1)).toBe(225);
    expect(stepPace(400, 1)).toBe(400);
    expect(stepPace(100, -1)).toBe(100);
  });

  it('counts words, and counts text written without spaces by its characters', () => {
    expect(countWords('one two  three')).toBe(3);
    expect(countWords('  ')).toBe(0);
    expect(countWords('')).toBe(0);
    expect(countWords('一二三四五六七八九十一二')).toBe(2);
  });

  it('turns a pace into pixels a second for the chapter shown', () => {
    // 240 words a minute is 4 words a second; 100 words over 1000 px is 10 px a word.
    expect(pixelsPerSecond(240, 1000, 100, 30)).toBe(40);
  });

  it('keeps the speed between a tenth of a line and three lines a second', () => {
    expect(pixelsPerSecond(400, 20000, 5, 30)).toBe(90);
    expect(pixelsPerSecond(100, 100, 10000, 30)).toBe(3);
    expect(pixelsPerSecond(200, 5000, 0, 30)).toBe(90);
  });
});
