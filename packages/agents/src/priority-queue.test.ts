import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PriorityQueue } from './priority-queue.js';

function drain<T>(queue: PriorityQueue<T>): T[] {
  const out: T[] = [];
  for (;;) {
    const next = queue.pop();
    if (next === undefined) break;
    out.push(next);
  }
  return out;
}

describe('PriorityQueue', () => {
  it('is empty on creation', () => {
    const queue = new PriorityQueue<string>();
    expect(queue.isEmpty).toBe(true);
    expect(queue.size).toBe(0);
    expect(queue.pop()).toBeUndefined();
    expect(queue.peek()).toBeUndefined();
  });

  it('returns items in ascending priority order', () => {
    const queue = new PriorityQueue<string>();
    queue.push('c', 3);
    queue.push('a', 1);
    queue.push('d', 4);
    queue.push('b', 2);
    expect(drain(queue)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('breaks ties by insertion order', () => {
    // Load-bearing: without stable ties, two runs of A* over the same problem can
    // return different equally optimal paths, and golden replays stop matching.
    const queue = new PriorityQueue<string>();
    queue.push('first', 1);
    queue.push('second', 1);
    queue.push('third', 1);
    expect(drain(queue)).toEqual(['first', 'second', 'third']);
  });

  it('peeks without removing', () => {
    const queue = new PriorityQueue<string>();
    queue.push('x', 5);
    queue.push('y', 1);
    expect(queue.peek()).toBe('y');
    expect(queue.size).toBe(2);
  });

  it('handles negative and fractional priorities', () => {
    const queue = new PriorityQueue<string>();
    queue.push('zero', 0);
    queue.push('negative', -2.5);
    queue.push('fraction', 0.5);
    expect(drain(queue)).toEqual(['negative', 'zero', 'fraction']);
  });

  it('agrees with a stable sort for any input', () => {
    fc.assert(
      fc.property(fc.array(fc.integer({ min: -50, max: 50 }), { maxLength: 200 }), (priorities) => {
        const queue = new PriorityQueue<number>();
        priorities.forEach((priority, index) => {
          queue.push(index, priority);
        });
        const expected = priorities
          .map((priority, index) => ({ priority, index }))
          .sort((a, b) => a.priority - b.priority || a.index - b.index)
          .map((entry) => entry.index);
        return JSON.stringify(drain(queue)) === JSON.stringify(expected);
      }),
    );
  });

  it('tracks size across interleaved pushes and pops', () => {
    const queue = new PriorityQueue<number>();
    queue.push(1, 1);
    queue.push(2, 2);
    expect(queue.size).toBe(2);
    queue.pop();
    expect(queue.size).toBe(1);
    queue.push(3, 0);
    expect(queue.peek()).toBe(3);
    expect(queue.size).toBe(2);
  });
});
