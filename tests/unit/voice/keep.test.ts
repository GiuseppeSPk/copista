import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IDLE_MS, NarratorKeeper } from '../../../src/voice/keep';
import { FakeNarrator } from '../../../src/voice/narrator';

function setUp() {
  const made: { gpu: boolean; narrator: FakeNarrator; destroyed: boolean }[] = [];
  const dropped = vi.fn();
  const keeper = new NarratorKeeper((gpu) => {
    const narrator = new FakeNarrator();
    const entry = { gpu, narrator, destroyed: false };
    narrator.destroy = () => {
      entry.destroyed = true;
    };
    made.push(entry);
    return narrator;
  }, dropped);
  return { keeper, made, dropped };
}

describe('NarratorKeeper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps one narrator for a chip, and makes another for the other chip', () => {
    const { keeper, made, dropped } = setUp();
    const first = keeper.narrator(false);
    expect(keeper.narrator(false)).toBe(first);
    expect(made).toHaveLength(1);
    const second = keeper.narrator(true);
    expect(second).not.toBe(first);
    expect(made[0]!.destroyed).toBe(true);
    expect(dropped).toHaveBeenCalledTimes(1);
  });

  it('loads once however many readings ask, and remembers it has', async () => {
    const { keeper } = setUp();
    const narrator = keeper.narrator(false);
    const load = vi.spyOn(narrator, 'load');
    const done = vi.fn();
    expect(keeper.loaded(narrator)).toBe(false);
    await Promise.all([keeper.load(narrator, done), keeper.load(narrator, done)]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
    expect(keeper.loaded(narrator)).toBe(true);
  });

  it('lets the next reading try again after a failed load', async () => {
    const { keeper } = setUp();
    const narrator = keeper.narrator(false);
    const load = vi
      .spyOn(narrator, 'load')
      .mockRejectedValueOnce(new Error('no'))
      .mockResolvedValueOnce();
    await expect(keeper.load(narrator)).rejects.toThrow('no');
    expect(keeper.loaded(narrator)).toBe(false);
    await keeper.load(narrator);
    expect(load).toHaveBeenCalledTimes(2);
    expect(keeper.loaded(narrator)).toBe(true);
  });

  it('keeps the voice while a reading goes on, and lets it go five minutes after', () => {
    const { keeper, made } = setUp();
    keeper.narrator(false);
    const end = keeper.begin();
    vi.advanceTimersByTime(IDLE_MS * 2);
    expect(made[0]!.destroyed).toBe(false);
    end();
    vi.advanceTimersByTime(IDLE_MS - 1);
    expect(made[0]!.destroyed).toBe(false);
    vi.advanceTimersByTime(1);
    expect(made[0]!.destroyed).toBe(true);
  });

  it('starts the five minutes again with each reading', () => {
    const { keeper, made } = setUp();
    keeper.narrator(false);
    keeper.begin()();
    vi.advanceTimersByTime(IDLE_MS - 1000);
    const end = keeper.begin();
    vi.advanceTimersByTime(2000);
    end();
    vi.advanceTimersByTime(IDLE_MS - 1000);
    expect(made[0]!.destroyed).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(made[0]!.destroyed).toBe(true);
  });

  it('lets go of a narrator asked for and never read with', () => {
    const { keeper, made } = setUp();
    keeper.narrator(false);
    vi.advanceTimersByTime(IDLE_MS);
    expect(made[0]!.destroyed).toBe(true);
  });

  it('counts a reading ended twice once', () => {
    const { keeper, made } = setUp();
    keeper.narrator(false);
    const end = keeper.begin();
    const other = keeper.begin();
    end();
    end();
    expect(keeper.reading).toBe(true);
    vi.advanceTimersByTime(IDLE_MS);
    expect(made[0]!.destroyed).toBe(false);
    other();
    expect(keeper.reading).toBe(false);
  });

  it('lets go at once when put away with nothing read, and not while reading', () => {
    const { keeper, made } = setUp();
    keeper.narrator(false);
    const end = keeper.begin();
    keeper.idle();
    expect(made[0]!.destroyed).toBe(false);
    end();
    keeper.idle();
    expect(made[0]!.destroyed).toBe(true);
  });

  it('forgets a load once the narrator is let go of, so the next one loads afresh', async () => {
    const { keeper, made, dropped } = setUp();
    const first = keeper.narrator(false);
    await keeper.load(first);
    keeper.drop();
    expect(dropped).toHaveBeenCalledTimes(1);
    keeper.drop();
    expect(dropped).toHaveBeenCalledTimes(1);
    const second = keeper.narrator(false);
    expect(second).not.toBe(first);
    expect(keeper.loaded(second)).toBe(false);
    expect(made).toHaveLength(2);
  });
});
