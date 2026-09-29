import { describe, expect, it } from 'vitest';
import {
  chebyshev,
  DIRECTIONS,
  Direction,
  directionBetween,
  manhattan,
  positionKey,
  samePosition,
  translate,
} from './geometry.js';

describe('DIRECTIONS', () => {
  it('is fixed at north, east, south, west', () => {
    // Search tie-breaking depends on this order; changing it changes which of
    // several equal-cost optimal paths every algorithm in the library returns.
    expect(DIRECTIONS).toEqual(['north', 'east', 'south', 'west']);
  });
});

describe('translate', () => {
  it('moves one tile with y growing downward', () => {
    expect(translate({ x: 2, y: 2 }, Direction.North)).toEqual({ x: 2, y: 1 });
    expect(translate({ x: 2, y: 2 }, Direction.South)).toEqual({ x: 2, y: 3 });
    expect(translate({ x: 2, y: 2 }, Direction.East)).toEqual({ x: 3, y: 2 });
    expect(translate({ x: 2, y: 2 }, Direction.West)).toEqual({ x: 1, y: 2 });
  });

  it('round-trips with directionBetween', () => {
    for (const direction of DIRECTIONS) {
      const from = { x: 5, y: 5 };
      expect(directionBetween(from, translate(from, direction))).toBe(direction);
    }
  });
});

describe('directionBetween', () => {
  it('returns null for non-adjacent or diagonal positions', () => {
    expect(directionBetween({ x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
    expect(directionBetween({ x: 0, y: 0 }, { x: 0, y: 3 })).toBeNull();
    expect(directionBetween({ x: 0, y: 0 }, { x: 0, y: 0 })).toBeNull();
  });
});

describe('distances', () => {
  it('computes manhattan and chebyshev distance', () => {
    expect(manhattan({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
    expect(chebyshev({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(4);
  });
});

describe('positionKey', () => {
  it('is injective over integer coordinates', () => {
    expect(positionKey({ x: 1, y: 23 })).toBe('1,23');
    expect(positionKey({ x: 12, y: 3 })).toBe('12,3');
  });
});

describe('samePosition', () => {
  it('compares structurally', () => {
    expect(samePosition({ x: 1, y: 2 }, { x: 1, y: 2 })).toBe(true);
    expect(samePosition({ x: 1, y: 2 }, { x: 2, y: 1 })).toBe(false);
  });
});
