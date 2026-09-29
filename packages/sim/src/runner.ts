import {
  isQuotaMet,
  positionKey,
  samePosition,
  step,
  type BotId,
  type Intent,
  type SimEvent,
  type WorldState,
} from '@rationauts/core';
import { createController, surveySites, type Controller } from './controller.js';
import type { PlannerId } from './navigators.js';
import { buildWorld, type Scenario } from './scenarios.js';
import type { PlanTelemetry } from './telemetry.js';

/**
 * Running a scenario with a given planner, and measuring what it cost.
 *
 * Exposed two ways over one implementation. {@link createRun} advances a tick at a
 * time, which is what the browser client needs in order to animate; {@link
 * runScenario} drives that to completion, which is what tests and the benchmark
 * need. There is deliberately no second code path: a "benchmark mode" whose numbers
 * could drift from what the game actually does would make the benchmark worthless.
 */

/** Everything measurable about a run so far. */
export interface RunMetrics {
  /** Simulation ticks elapsed: the player-visible "how long did that take". */
  readonly ticks: number;
  /** Total terrain cost paid for movement. */
  readonly pathCost: number;
  /** Search nodes expanded across every plan made. */
  readonly expanded: number;
  readonly generated: number;
  /** How many times a controller had to re-plan. */
  readonly plans: number;
  /** Actions the engine refused, excluding cooldown. The signature of a stuck agent. */
  readonly failures: number;
}

export const ZERO_METRICS: RunMetrics = {
  ticks: 0,
  pathCost: 0,
  expanded: 0,
  generated: 0,
  plans: 0,
  failures: 0,
};

export interface RunSnapshot {
  readonly state: WorldState;
  readonly metrics: RunMetrics;
  /** True once the scenario's objective is met. */
  readonly succeeded: boolean;
  /** True once the run is over, whether it succeeded or ran out of ticks. */
  readonly finished: boolean;
  /** The most recent plan per bot, for the client's overlay. */
  readonly plans: ReadonlyMap<BotId, PlanTelemetry | null>;
  /** Events from the tick just applied. */
  readonly events: readonly SimEvent[];
  /**
   * Position keys every bot has stood on.
   *
   * Surveying leaves no trace in the world, since a surveyed grove looks exactly like
   * an unsurveyed one. Without this the client cannot show progress, and a player
   * watching a survey has no way to tell how much is left.
   */
  readonly visited: ReadonlySet<string>;
}

/** A run that can be advanced one tick at a time. */
export interface Run {
  readonly scenario: Scenario;
  readonly planner: PlannerId;
  /** The intents issued on each tick so far: enough to replay the run exactly. */
  readonly intents: readonly (readonly Intent[])[];
  snapshot(): RunSnapshot;
  /** Advances one tick, or returns the current snapshot unchanged once finished. */
  tick(): RunSnapshot;
}

export interface RunOptions {
  /** Overrides the scenario's own tick budget. */
  readonly maxTicks?: number;
  /** Called after every tick. */
  readonly onTick?: (state: WorldState, events: readonly SimEvent[]) => void;
}

/**
 * A survey is finished when every grove has been stood on and a bot is home again.
 *
 * Surveying consumes nothing, so completion cannot be read off the world state alone
 * because a surveyed grove looks exactly like an unsurveyed one. The run therefore keeps
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
 * Creates a run, ready at tick zero.
 *
 * Deterministic by construction: the world is built from the scenario's seed, each
 * controller is a pure function of the state it is shown, and `step` consults no
 * ambient state. Two runs created with the same arguments and ticked the same number
 * of times are indistinguishable.
 */
export function createRun(scenario: Scenario, planner: PlannerId, options: RunOptions = {}): Run {
  const maxTicks = options.maxTicks ?? scenario.maxTicks;

  let state = buildWorld(scenario);
  let metrics: RunMetrics = ZERO_METRICS;
  let events: readonly SimEvent[] = [];

  const controllers = new Map<BotId, Controller>();
  for (const bot of state.bots) {
    controllers.set(bot.id, createController(planner, scenario.objective));
  }

  const intents: (readonly Intent[])[] = [];
  const visited = new Set<string>();
  // Telemetry objects are replaced wholesale on each re-plan, so identity is a
  // reliable way to count distinct plans without the controller reporting it.
  const countedPlans = new Set<PlanTelemetry>();
  const plans = new Map<BotId, PlanTelemetry | null>();

  const record = (): void => {
    for (const bot of state.bots) visited.add(positionKey(bot.position));
  };
  record();

  const snapshot = (): RunSnapshot => {
    const succeeded = isComplete(scenario, state, visited);
    return {
      state,
      metrics,
      succeeded,
      finished: succeeded || state.tick >= maxTicks,
      plans: new Map(plans),
      events,
      visited: new Set(visited),
    };
  };

  return {
    scenario,
    planner,
    get intents() {
      return intents;
    },
    snapshot,
    tick(): RunSnapshot {
      const current = snapshot();
      if (current.finished) return current;

      const batch: Intent[] = [];
      let expanded = metrics.expanded;
      let generated = metrics.generated;
      let planCount = metrics.plans;

      for (const bot of state.bots) {
        const controller = controllers.get(bot.id);
        if (controller === undefined) continue;
        batch.push(controller.decide(state, bot.id));

        const plan = controller.lastPlan;
        plans.set(bot.id, plan);
        if (plan !== null && !countedPlans.has(plan)) {
          countedPlans.add(plan);
          planCount++;
          expanded += plan.stats.expanded;
          generated += plan.stats.generated;
        }
      }

      const result = step(state, batch);
      intents.push(batch);

      let pathCost = metrics.pathCost;
      let failures = metrics.failures;
      for (const event of result.events) {
        if (event.type === 'moved') pathCost += event.cost;
        else if (event.type === 'action-failed' && event.reason !== 'on-cooldown') failures++;
      }

      state = result.state;
      events = result.events;
      metrics = { ticks: state.tick, pathCost, expanded, generated, plans: planCount, failures };
      record();
      return snapshot();
    },
  };
}

export interface RunReport {
  readonly scenario: string;
  readonly planner: PlannerId;
  readonly succeeded: boolean;
  readonly metrics: RunMetrics;
  /** The intent issued on each tick: everything needed to replay the run exactly. */
  readonly intents: readonly (readonly Intent[])[];
  readonly finalState: WorldState;
}

/** Runs `scenario` with `planner` until it succeeds or runs out of ticks. */
export function runScenario(
  scenario: Scenario,
  planner: PlannerId,
  options: RunOptions = {},
): RunReport {
  const run = createRun(scenario, planner, options);
  let snapshot = run.snapshot();
  while (!snapshot.finished) {
    snapshot = run.tick();
    options.onTick?.(snapshot.state, snapshot.events);
  }
  return {
    scenario: scenario.id,
    planner,
    succeeded: snapshot.succeeded,
    metrics: snapshot.metrics,
    intents: run.intents,
    finalState: snapshot.state,
  };
}

/**
 * Replays a recorded intent log against a freshly built world.
 *
 * Used by the determinism tests: if replaying a run's own intents does not reproduce
 * its final state exactly, something is reading state it should not.
 */
export function replay(scenario: Scenario, intents: readonly (readonly Intent[])[]): WorldState {
  return intents.reduce<WorldState>(
    (state, batch) => step(state, batch).state,
    buildWorld(scenario),
  );
}
