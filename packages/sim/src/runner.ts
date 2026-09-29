import {
  isQuotaMet,
  positionKey,
  samePosition,
  step,
  type Intent,
  type SimEvent,
  type WorldState,
} from '@rationauts/core';
import { createController, surveySites, type Controller } from './controller.js';
import type { PlannerId } from './navigators.js';
import { buildWorld, type Scenario } from './scenarios.js';

/**
 * Running a scenario with a given planner, and measuring what it cost.
 *
 * The same function backs the game, the tests and the benchmark. There is no separate
 * "benchmark mode" whose numbers could drift from what the game actually does.
 */

/** Everything measurable about one run. */
export interface RunMetrics {
  /** Simulation ticks elapsed. The player-visible measure of "how long did that take". */
  readonly ticks: number;
  /** Total terrain cost paid for movement. */
  readonly pathCost: number;
  /** Search nodes expanded across every plan the controller made. */
  readonly expanded: number;
  readonly generated: number;
  /** How many times the controller had to re-plan. */
  readonly plans: number;
  /** Actions the engine refused, by reason. Usually the signature of a stuck agent. */
  readonly failures: number;
}

export interface RunReport {
  readonly scenario: string;
  readonly planner: PlannerId;
  readonly succeeded: boolean;
  readonly metrics: RunMetrics;
  /** The intent issued on each tick — everything needed to replay the run exactly. */
  readonly intents: readonly (readonly Intent[])[];
  readonly finalState: WorldState;
}

export interface RunOptions {
  /** Overrides the scenario's own tick budget. */
  readonly maxTicks?: number;
  /** Called after every tick, for the client's animation loop. */
  readonly onTick?: (state: WorldState, events: readonly SimEvent[]) => void;
}

/**
 * A survey is finished when every grove has been stood on and a bot is home again.
 *
 * Surveying consumes nothing, so completion cannot be read off the world state alone
 * — a surveyed grove looks exactly like an unsurveyed one. The runner therefore keeps
 * its own record of where bots have been, accumulated from the positions it observes.
 */
function surveyComplete(state: WorldState, visited: ReadonlySet<string>): boolean {
  const allVisited = surveySites(state).every((site) => visited.has(positionKey(site)));
  if (!allVisited) return false;
  return state.bots.some((bot) =>
    state.depots.some((depot) => samePosition(bot.position, depot.position)),
  );
}

function isComplete(scenario: Scenario, state: WorldState, visited: ReadonlySet<string>): boolean {
  return scenario.objective.kind === 'survey' ? surveyComplete(state, visited) : isQuotaMet(state);
}

/**
 * Runs `scenario` with `planner` until it succeeds or runs out of ticks.
 *
 * Deterministic by construction: the world is built from the scenario's seed, the
 * controller is a pure function of the state it is shown, and `step` consults no
 * ambient state. Two calls with the same arguments produce identical reports.
 */
export function runScenario(
  scenario: Scenario,
  planner: PlannerId,
  options: RunOptions = {},
): RunReport {
  const maxTicks = options.maxTicks ?? scenario.maxTicks;
  const controllers = new Map<string, Controller>();

  let state = buildWorld(scenario);
  for (const bot of state.bots) {
    controllers.set(bot.id, createController(planner, scenario.objective));
  }

  const intents: (readonly Intent[])[] = [];
  let pathCost = 0;
  let expanded = 0;
  let generated = 0;
  let plans = 0;
  let failures = 0;
  const seenPlans = new Set<unknown>();
  const visited = new Set<string>();

  const recordPositions = (world: WorldState): void => {
    for (const bot of world.bots) visited.add(positionKey(bot.position));
  };
  recordPositions(state);

  while (state.tick < maxTicks && !isComplete(scenario, state, visited)) {
    const batch: Intent[] = [];
    for (const bot of state.bots) {
      const controller = controllers.get(bot.id);
      if (controller === undefined) continue;
      batch.push(controller.decide(state, bot.id));

      // Telemetry objects are replaced wholesale on each re-plan, so identity is a
      // reliable way to count distinct plans without the controller reporting it.
      const plan = controller.lastPlan;
      if (plan !== null && !seenPlans.has(plan)) {
        seenPlans.add(plan);
        plans++;
        expanded += plan.stats.expanded;
        generated += plan.stats.generated;
      }
    }

    const result = step(state, batch);
    intents.push(batch);
    for (const event of result.events) {
      if (event.type === 'moved') pathCost += event.cost;
      else if (event.type === 'action-failed' && event.reason !== 'on-cooldown') failures++;
    }
    state = result.state;
    recordPositions(state);
    options.onTick?.(state, result.events);
  }

  return {
    scenario: scenario.id,
    planner,
    succeeded: isComplete(scenario, state, visited),
    metrics: { ticks: state.tick, pathCost, expanded, generated, plans, failures },
    intents,
    finalState: state,
  };
}

/**
 * Replays a recorded intent log against a freshly built world.
 *
 * Used by the determinism tests: if replaying a run's own intents does not reproduce
 * its final state exactly, something in the engine or the controllers is reading
 * state it should not.
 */
export function replay(scenario: Scenario, intents: readonly (readonly Intent[])[]): WorldState {
  return intents.reduce<WorldState>(
    (state, batch) => step(state, batch).state,
    buildWorld(scenario),
  );
}
