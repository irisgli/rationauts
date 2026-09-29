/**
 * `@rationauts/core` — the deterministic simulation engine.
 *
 * This package knows nothing about artificial intelligence, rendering or scenarios.
 * It exposes a world state, a set of intents an agent may request, and a single
 * pure transition function. Everything else in Rationauts is built on top of it.
 *
 * @packageDocumentation
 */

export * from './geometry.js';
export * from './grid.js';
export * from './rng.js';
export * from './terrain.js';
export * from './world.js';
