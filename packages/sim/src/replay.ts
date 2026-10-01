import { DIRECTIONS, type Direction, type Intent, type WorldState } from '@rationauts/core';
import { isPlannerId, type PlannerId } from './navigators.js';
import { replayIntents } from './runner.js';
import { scenarioById } from './scenarios.js';

/**
 * The replay file format.
 *
 * A replay is the only untrusted input this project accepts: everything else is
 * either compiled in or typed by the person running it. The whole file is therefore
 * data, never anything that gets evaluated, and `parseReplay` treats it as hostile
 * until every field has been checked.
 *
 * The format is deliberately tiny. Because the engine is deterministic, a run is
 * fully described by the scenario it was built from and the intents issued on each
 * tick; states are recomputed rather than stored. That keeps a long replay small and
 * means a replay cannot assert a world that the engine would never produce.
 */

/**
 * Incremented when a change would make an older file parse into something different.
 *
 * Adding an optional field does not need a bump. Changing the meaning of an existing
 * one does, because silently reinterpreting an old file is worse than refusing it.
 */
export const REPLAY_VERSION = 1;

export interface Replay {
  readonly version: number;
  readonly scenario: string;
  readonly planner: PlannerId;
  /** Intents issued on each tick, in order. */
  readonly intents: readonly (readonly Intent[])[];
}

/**
 * Bounds on a parsed replay.
 *
 * These exist so that a malformed or malicious file fails fast instead of being
 * allowed to allocate until the tab dies. They are far above anything a real run
 * produces: the longest scenario budget is 1,200 ticks and scenarios have one bot.
 */
export const REPLAY_LIMITS = {
  maxTicks: 100_000,
  maxIntentsPerTick: 64,
} as const;

export class ReplayError extends Error {
  override readonly name = 'ReplayError';
}

function fail(message: string): never {
  throw new ReplayError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDirection(value: unknown, where: string): Direction {
  if (typeof value !== 'string' || !(DIRECTIONS as readonly string[]).includes(value)) {
    fail(`${where}: expected one of ${DIRECTIONS.join(', ')}, received ${JSON.stringify(value)}`);
  }
  return value as Direction;
}

function parseBotId(value: unknown, where: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${where}: bot must be a non-empty string`);
  }
  return value;
}

function parseIntent(value: unknown, where: string): Intent {
  if (!isRecord(value)) fail(`${where}: expected an object`);

  const bot = parseBotId(value.bot, where);
  switch (value.kind) {
    case 'move':
      return { kind: 'move', bot, direction: parseDirection(value.direction, where) };
    case 'harvest':
      return { kind: 'harvest', bot };
    case 'deposit':
      return { kind: 'deposit', bot };
    case 'wait':
      return { kind: 'wait', bot };
    default:
      return fail(`${where}: unknown intent kind ${JSON.stringify(value.kind)}`);
  }
}

/**
 * Validates untrusted input and returns a replay, or throws {@link ReplayError}.
 *
 * Every field is rebuilt rather than passed through, so the returned object shares no
 * structure with the input. A parsed replay cannot carry extra properties, and
 * nothing a caller later reads can have been supplied by the file.
 */
export function parseReplay(input: unknown): Replay {
  if (typeof input === 'string') {
    let decoded: unknown;
    try {
      decoded = JSON.parse(input);
    } catch (cause) {
      fail(`not valid JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
    return parseReplay(decoded);
  }

  if (!isRecord(input)) fail('expected a JSON object at the top level');

  if (input.version !== REPLAY_VERSION) {
    fail(
      `unsupported replay version ${JSON.stringify(input.version)}, ` +
        `this build reads version ${String(REPLAY_VERSION)}`,
    );
  }

  const scenario = input.scenario;
  if (typeof scenario !== 'string') fail('scenario must be a string');
  if (scenarioById(scenario) === undefined) fail(`unknown scenario ${JSON.stringify(scenario)}`);

  const planner = input.planner;
  if (typeof planner !== 'string' || !isPlannerId(planner)) {
    fail(`unknown planner ${JSON.stringify(planner)}`);
  }

  const ticks = input.intents;
  if (!Array.isArray(ticks)) fail('intents must be an array');
  if (ticks.length > REPLAY_LIMITS.maxTicks) {
    fail(
      `replay has ${String(ticks.length)} ticks, the limit is ${String(REPLAY_LIMITS.maxTicks)}`,
    );
  }

  const intents = ticks.map((tick, index): readonly Intent[] => {
    if (!Array.isArray(tick)) fail(`tick ${String(index)}: expected an array of intents`);
    if (tick.length > REPLAY_LIMITS.maxIntentsPerTick) {
      fail(
        `tick ${String(index)}: ${String(tick.length)} intents, ` +
          `the limit is ${String(REPLAY_LIMITS.maxIntentsPerTick)}`,
      );
    }
    return tick.map((intent, slot) =>
      parseIntent(intent, `tick ${String(index)}, intent ${String(slot)}`),
    );
  });

  return { version: REPLAY_VERSION, scenario, planner, intents };
}

/** Serialises a replay to JSON. */
export function encodeReplay(replay: Replay): string {
  return `${JSON.stringify(replay, null, 2)}\n`;
}

/**
 * Rebuilds the world a replay describes.
 *
 * The scenario is looked up by id and rebuilt from the compiled definition, so a file
 * can choose which scenario to replay but cannot describe one. That is the property
 * that keeps the format small and keeps a replay from asserting a world the engine
 * would never have produced.
 */
export function playReplay(replay: Replay): WorldState {
  const scenario = scenarioById(replay.scenario);
  if (scenario === undefined) fail(`unknown scenario ${JSON.stringify(replay.scenario)}`);
  return replayIntents(scenario, replay.intents);
}
