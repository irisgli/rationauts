import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeRng, nextFloat, nextInt, nextUint32, shuffle } from './rng.js';

describe('makeRng', () => {
  it('normalises seeds to unsigned 32-bit integers', () => {
    expect(makeRng(-1).state).toBe(0xffff_ffff);
    expect(makeRng(7.9).state).toBe(7);
  });
});

describe('nextUint32', () => {
  it('is deterministic for a given seed', () => {
    const a = makeRng(42);
    const b = makeRng(42);
    expect(nextUint32(a)[0]).toBe(nextUint32(b)[0]);
  });

  it('does not mutate the generator it is given', () => {
    const rng = makeRng(1);
    nextUint32(rng);
    expect(rng.state).toBe(makeRng(1).state);
  });

  it('produces a different stream for a different seed', () => {
    const drawTen = (seed: number): number[] => {
      let rng = makeRng(seed);
      return Array.from({ length: 10 }, () => {
        const [value, next] = nextUint32(rng);
        rng = next;
        return value;
      });
    };
    expect(drawTen(1)).not.toEqual(drawTen(2));
  });

  it('always yields a 32-bit unsigned integer', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const [value] = nextUint32(makeRng(seed));
        return Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;
      }),
    );
  });
});

describe('nextFloat', () => {
  it('stays within the half-open unit interval', () => {
    fc.assert(
      fc.property(fc.integer(), (seed) => {
        const [value] = nextFloat(makeRng(seed));
        return value >= 0 && value < 1;
      }),
    );
  });
});

describe('nextInt', () => {
  it('stays within range', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer({ min: 1, max: 1000 }), (seed, bound) => {
        const [value] = nextInt(makeRng(seed), bound);
        return Number.isInteger(value) && value >= 0 && value < bound;
      }),
    );
  });

  it('rejects a non-positive bound', () => {
    expect(() => nextInt(makeRng(0), 0)).toThrow(RangeError);
    expect(() => nextInt(makeRng(0), 2.5)).toThrow(RangeError);
  });
});

describe('shuffle', () => {
  it('is a permutation of its input', () => {
    fc.assert(
      fc.property(fc.integer(), fc.array(fc.integer(), { maxLength: 50 }), (seed, items) => {
        const [shuffled] = shuffle(makeRng(seed), items);
        return (
          shuffled.length === items.length &&
          [...shuffled].sort((a, b) => a - b).join() === [...items].sort((a, b) => a - b).join()
        );
      }),
    );
  });

  it('leaves the input array untouched', () => {
    const items = [1, 2, 3, 4, 5];
    shuffle(makeRng(9), items);
    expect(items).toEqual([1, 2, 3, 4, 5]);
  });

  it('is reproducible for a fixed seed', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    const [first] = shuffle(makeRng(123), items);
    const [second] = shuffle(makeRng(123), items);
    expect(first).toEqual(second);
  });
});
