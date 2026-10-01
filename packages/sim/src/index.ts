/**
 * `@rationauts/sim`: the layer that binds algorithms to the game.
 *
 * Adapters expressing Rationauts' problems as `SearchProblem`s, the installable
 * planners, the scenario ladder, the runner that measures a run, and a seeded maze
 * generator for benchmarks. This is also the only headless package permitted to read
 * the clock, because measuring is its job.
 *
 * @packageDocumentation
 */

export * from './controller.js';
export * from './maze.js';
export * from './navigators.js';
export * from './problems.js';
export * from './replay.js';
export * from './runner.js';
export * from './scenarios.js';
export * from './telemetry.js';
