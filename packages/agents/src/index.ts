/**
 * `@rationauts/agents` — classical AI algorithms, independent of any game.
 *
 * This package deliberately depends on nothing, including `@rationauts/core`.
 * Algorithms are written against small structural interfaces describing a *problem*,
 * so they can be validated against instances with independently known answers and
 * reused across problems whose state types differ.
 *
 * @see docs/adr/0004-algorithms-are-game-agnostic.md
 * @packageDocumentation
 */

export * from './node.js';
export * from './priority-queue.js';
export * from './problem.js';
export * from './search.js';
