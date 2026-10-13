import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Autoscroll,
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

describe('Autoscroll', () => {
  let moved: number[];
  let atEnd: boolean;
  let states: boolean[];
  let onEnd: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  let scroll: Autoscroll;

  const total = (): number => moved.reduce((sum, px) => sum + px, 0);

  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame'],
    });
    moved = [];
    atEnd = false;
    states = [];
    onEnd = vi.fn(() => Promise.resolve(false));
    scroll = new Autoscroll({
      advance(px) {
        if (atEnd) return false;
        moved.push(px);
        return true;
      },
      speed: () => 100,
      onEnd: () => onEnd(),
      onState: (playing) => states.push(playing),
    });
  });

  afterEach(() => {
    scroll.destroy();
    vi.useRealTimers();
  });

  it('moves at its speed once it has eased in, and stops on pause', () => {
    scroll.play();
    expect(scroll.playing).toBe(true);
    expect(states).toEqual([true]);
    vi.advanceTimersByTime(500);
    const eased = total();
    expect(eased).toBeGreaterThan(0);
    expect(eased).toBeLessThan(50);
    vi.advanceTimersByTime(1000);
    expect(total() - eased).toBeGreaterThan(95);
    expect(total() - eased).toBeLessThan(105);
    scroll.pause();
    const paused = total();
    vi.advanceTimersByTime(1000);
    expect(total()).toBe(paused);
    expect(scroll.playing).toBe(false);
    expect(states).toEqual([true, false]);
  });

  it('holds while the reader scrolls and carries on 1.5 s after the last touch', () => {
    scroll.play();
    vi.advanceTimersByTime(1000);
    scroll.hold();
    const held = total();
    vi.advanceTimersByTime(1000);
    scroll.hold();
    vi.advanceTimersByTime(1400);
    expect(total()).toBe(held);
    expect(scroll.playing).toBe(true);
    vi.advanceTimersByTime(600);
    expect(total()).toBeGreaterThan(held);
    expect(states).toEqual([true]);
  });

  it('waits 1.5 s at the end of a chapter, then carries on when told to', async () => {
    onEnd.mockImplementation(() => {
      atEnd = false;
      return Promise.resolve(true);
    });
    scroll.play();
    vi.advanceTimersByTime(1000);
    atEnd = true;
    vi.advanceTimersByTime(1400);
    expect(onEnd).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(onEnd).toHaveBeenCalledTimes(1);
    const carried = total();
    await vi.advanceTimersByTimeAsync(1000);
    expect(total()).toBeGreaterThan(carried);
    expect(scroll.playing).toBe(true);
  });

  it('stops at the end of the book', async () => {
    scroll.play();
    atEnd = true;
    await vi.advanceTimersByTimeAsync(2000);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(scroll.playing).toBe(false);
    expect(states).toEqual([true, false]);
  });

  it('does not start again when paused while the next chapter loads', async () => {
    let carryOn: (go: boolean) => void = () => undefined;
    onEnd.mockImplementation(() => new Promise<boolean>((resolve) => (carryOn = resolve)));
    scroll.play();
    atEnd = true;
    await vi.advanceTimersByTimeAsync(2000);
    scroll.pause();
    atEnd = false;
    carryOn(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(moved).toEqual([]);
    expect(scroll.playing).toBe(false);
  });

  it('pauses when the page is hidden', () => {
    scroll.play();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    expect(scroll.playing).toBe(false);
  });

  it('keeps the screen awake while it plays, and carries on without a wake lock', async () => {
    const release = vi.fn(() => Promise.resolve());
    const request = vi.fn(() => Promise.resolve({ release }));
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    scroll.play();
    await vi.advanceTimersByTimeAsync(100);
    expect(request).toHaveBeenCalledWith('screen');
    scroll.pause();
    expect(release).toHaveBeenCalledTimes(1);

    request.mockImplementation(() => Promise.reject(new Error('not allowed')));
    scroll.play();
    await vi.advanceTimersByTimeAsync(1000);
    expect(total()).toBeGreaterThan(0);
    Reflect.deleteProperty(navigator, 'wakeLock');
  });

  it('stops for good once destroyed', () => {
    scroll.play();
    scroll.destroy();
    const stopped = total();
    scroll.play();
    vi.advanceTimersByTime(1000);
    expect(total()).toBe(stopped);
    expect(scroll.playing).toBe(false);
  });
});
