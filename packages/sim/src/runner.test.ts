import { describe, expect, it } from 'vitest';
import { PLANNERS, PLANNER_IDS, type PlannerId } from './navigators.js';
import { createRun, replayIntents, runScenario } from './runner.js';
import { buildWorld, SCENARIOS, scenarioById } from './scenarios.js';

const OPTIMAL_PLANNERS = PLANNER_IDS.filter(
  (id): id is Exclude<PlannerId, 'reflex'> => id !== 'reflex' && PLANNERS[id].optimal,
);

describe('scenario definitions', () => {
  it('every scenario builds a world with a bot and a depot', () => {
    for (const scenario of SCENARIOS) {
      const world = buildWorld(scenario);
      expect(world.bots.length, scenario.id).toBeGreaterThan(0);
      expect(world.depots.length, scenario.id).toBeGreaterThan(0);
      expect(world.nodes.length, scenario.id).toBeGreaterThan(0);
    }
  });

  it('has unique ids', () => {
    expect(new Set(SCENARIOS.map((s) => s.id)).size).toBe(SCENARIOS.length);
  });

  it('looks scenarios up by id', () => {
    expect(scenarioById('mudflats')?.name).toBe('Mudflats');
    expect(scenarioById('nope')).toBeUndefined();
  });
});

describe('the difficulty ladder', () => {
  it('A* completes every scenario', () => {
    for (const scenario of SCENARIOS) {
      expect(runScenario(scenario, 'astar').succeeded, scenario.id).toBe(true);
    }
  });

  it('planners listed as failing really do fail, and no others do', () => {
    // This is the test that stops the curriculum quietly hollowing out. If a change
    // makes the reflex agent good enough for `wall-gap`, the scenario has stopped
    // arguing for search and the build should say so.
    for (const scenario of SCENARIOS) {
      for (const planner of PLANNER_IDS) {
        const expectedToFail = scenario.expectedToFail.includes(planner);
        const { succeeded } = runScenario(scenario, planner);
        expect(succeeded, `${scenario.id} / ${planner}`).toBe(!expectedToFail);
      }
    }
  });

  it('open-field is winnable without installing anything', () => {
    const scenario = scenarioById('open-field');
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    const reflex = runScenario(scenario, 'reflex');
    expect(reflex.succeeded).toBe(true);
    // A reflex agent does no search at all, which is the whole point of the tier.
    expect(reflex.metrics.expanded).toBe(0);
  });

  it('wall-gap strands a reflex agent in the pocket', () => {
    const scenario = scenarioById('wall-gap');
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    const reflex = runScenario(scenario, 'reflex');
    expect(reflex.succeeded).toBe(false);
    // Stuck, not wandering: it stops moving long before the tick budget runs out.
    expect(reflex.metrics.pathCost).toBeLessThan(20);
  });

  it('mudflats punishes counting steps instead of cost', () => {
    const scenario = scenarioById('mudflats');
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    const bfs = runScenario(scenario, 'bfs');
    const ucs = runScenario(scenario, 'ucs');
    expect(bfs.succeeded && ucs.succeeded).toBe(true);
    // Breadth-first finds a route that is no longer in steps and far worse in time.
    expect(bfs.metrics.pathCost).toBeGreaterThan(ucs.metrics.pathCost * 2);
    expect(bfs.metrics.ticks).toBeGreaterThan(ucs.metrics.ticks);
  });

  it('great-plain shows the heuristic paying for itself', () => {
    const scenario = scenarioById('great-plain');
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    const ucs = runScenario(scenario, 'ucs');
    const astar = runScenario(scenario, 'astar');
    // Same answer...
    expect(astar.metrics.pathCost).toBe(ucs.metrics.pathCost);
    expect(astar.metrics.ticks).toBe(ucs.metrics.ticks);
    // ...for substantially less searching. That difference is the lesson.
    expect(astar.metrics.expanded).toBeLessThan(ucs.metrics.expanded / 2);
  });

  it('four-groves is solved by the same A* over a different state type', () => {
    const scenario = scenarioById('four-groves');
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    const astar = runScenario(scenario, 'astar');
    const ucs = runScenario(scenario, 'ucs');
    expect(astar.succeeded).toBe(true);
    expect(astar.metrics.pathCost).toBe(ucs.metrics.pathCost);
    expect(astar.metrics.expanded).toBeLessThan(ucs.metrics.expanded);
  });
});

describe('optimality', () => {
  it('every optimal planner agrees on cost, in every scenario', () => {
    for (const scenario of SCENARIOS) {
      const costs = OPTIMAL_PLANNERS.map((planner) => runScenario(scenario, planner)).map(
        (report) => report.metrics.pathCost,
      );
      expect(new Set(costs).size, `${scenario.id}: ${costs.join(', ')}`).toBe(1);
    }
  });

  it('no planner ever beats an optimal one', () => {
    for (const scenario of SCENARIOS) {
      const best = runScenario(scenario, 'astar');
      if (!best.succeeded) continue;
      for (const planner of PLANNER_IDS) {
        const report = runScenario(scenario, planner);
        if (!report.succeeded) continue;
        expect(report.metrics.pathCost, `${scenario.id} / ${planner}`).toBeGreaterThanOrEqual(
          best.metrics.pathCost,
        );
      }
    }
  });

  it('A* never expands more than uniform-cost search', () => {
    for (const scenario of SCENARIOS) {
      const ucs = runScenario(scenario, 'ucs');
      const astar = runScenario(scenario, 'astar');
      expect(astar.metrics.expanded, scenario.id).toBeLessThanOrEqual(ucs.metrics.expanded);
    }
  });
});

describe('determinism', () => {
  it('produces identical reports across runs', () => {
    for (const scenario of SCENARIOS) {
      for (const planner of PLANNER_IDS) {
        const first = runScenario(scenario, planner);
        const second = runScenario(scenario, planner);
        expect(second.metrics, `${scenario.id} / ${planner}`).toEqual(first.metrics);
        expect(second.intents).toEqual(first.intents);
      }
    }
  });

  it('replaying a run reproduces its final state exactly', () => {
    // If this fails, something is reading state it should not: the recorded intents
    // are the only input, and the engine is supposed to be a pure function of them.
    for (const scenario of SCENARIOS) {
      const report = runScenario(scenario, 'astar');
      expect(replayIntents(scenario, report.intents), scenario.id).toEqual(report.finalState);
    }
  });
});

describe('runner options', () => {
  it('honours a tighter tick budget', () => {
    const scenario = scenarioById('great-plain');
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    const report = runScenario(scenario, 'astar', { maxTicks: 5 });
    expect(report.succeeded).toBe(false);
    expect(report.metrics.ticks).toBe(5);
  });

  it('reports every tick to the observer', () => {
    const scenario = scenarioById('open-field');
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    let ticks = 0;
    const report = runScenario(scenario, 'astar', {
      onTick: () => {
        ticks++;
      },
    });
    expect(ticks).toBe(report.metrics.ticks);
  });
});

describe('createRun', () => {
  it('advances one tick at a time and agrees with a full run', () => {
    // The client drives ticks by hand; the benchmark drives them in a loop. Both go
    // through this object, so they cannot drift apart.
    for (const scenario of SCENARIOS) {
      const run = createRun(scenario, 'astar');
      let snapshot = run.snapshot();
      expect(snapshot.metrics.ticks).toBe(0);
      while (!snapshot.finished) snapshot = run.tick();

      const complete = runScenario(scenario, 'astar');
      expect(snapshot.metrics, scenario.id).toEqual(complete.metrics);
      expect(snapshot.succeeded).toBe(complete.succeeded);
      expect(run.intents).toEqual(complete.intents);
    }
  });

  it('ignores further ticks once finished', () => {
    const scenario = scenarioById('open-field');
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    const run = createRun(scenario, 'astar');
    let snapshot = run.snapshot();
    while (!snapshot.finished) snapshot = run.tick();
    const settled = snapshot.metrics;
    run.tick();
    run.tick();
    expect(run.snapshot().metrics).toEqual(settled);
  });

  it('counts each plan once, however many ticks it survives', () => {
    // The plan counter is the reason the run tracks plan identity at all, so it is
    // pinned against what an observer watching every tick would count. A plan is
    // visible for as many ticks as the bot takes to follow it, and must still
    // contribute to `plans` exactly once.
    for (const scenario of SCENARIOS) {
      const run = createRun(scenario, 'astar');
      const distinct = new Set<unknown>();
      let snapshot = run.snapshot();
      while (!snapshot.finished) {
        snapshot = run.tick();
        for (const plan of snapshot.plans.values()) {
          if (plan !== null) distinct.add(plan);
        }
      }
      expect(snapshot.metrics.plans, scenario.id).toBe(distinct.size);
      expect(distinct.size).toBeGreaterThan(0);
    }
  });

  it('exposes the current plan per bot for the overlay', () => {
    const scenario = scenarioById('great-plain');
    expect(scenario).toBeDefined();
    if (scenario === undefined) return;
    const run = createRun(scenario, 'astar');
    const snapshot = run.tick();
    const plan = [...snapshot.plans.values()][0];
    expect(plan?.explored.length).toBeGreaterThan(0);
  });
});
