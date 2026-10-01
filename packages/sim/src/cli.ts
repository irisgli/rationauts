#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { PLANNER_IDS, isPlannerId, type PlannerId } from './navigators.js';
import { encodeReplay, parseReplay, playReplay, REPLAY_VERSION } from './replay.js';
import { runScenario } from './runner.js';
import { SCENARIOS, scenarioById } from './scenarios.js';

/**
 * The headless entry point: `rationauts run <scenario> [planner]` and
 * `rationauts bench`.
 *
 * The benchmark exists to make the curriculum's central claim checkable from a
 * terminal. On `great-plain`, uniform-cost search and A* return paths of identical
 * cost and A* examines a fraction of the tiles; on `mudflats`, breadth-first search
 * finds a shorter route that takes far longer to walk. Those are the lessons, and
 * they should be one command away rather than something a reader has to take on
 * trust.
 */

const USAGE = `rationauts: headless scenario runner

Usage:
  rationauts run <scenario> [planner]   Run one scenario and print its metrics
  rationauts bench [--json]             Run every planner on every scenario
  rationauts list                       List scenarios and planners
  rationauts record <scenario> [planner]  Write a replay to stdout
  rationauts play <file>                Replay a recorded run and report the outcome

Planners: ${PLANNER_IDS.join(', ')}
`;

function formatRow(cells: readonly string[], widths: readonly number[]): string {
  return cells
    .map((cell, index) => cell.padEnd(widths[index] ?? 0))
    .join('  ')
    .trimEnd();
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const widths = header.map((cell, index) =>
    Math.max(cell.length, ...rows.map((row) => (row[index] ?? '').length)),
  );
  const lines = [
    formatRow(header, widths),
    widths.map((width) => '-'.repeat(width)).join('  '),
    ...rows.map((row) => formatRow(row, widths)),
  ];
  return lines.join('\n');
}

function runOne(scenarioId: string, plannerId: PlannerId): number {
  const scenario = scenarioById(scenarioId);
  if (scenario === undefined) {
    console.error(`Unknown scenario: ${scenarioId}`);
    return 1;
  }

  const started = performance.now();
  const report = runScenario(scenario, plannerId);
  const elapsed = performance.now() - started;

  console.log(`${scenario.name} / ${plannerId}`);
  console.log(scenario.brief);
  console.log('');
  console.log(
    table(
      ['outcome', 'ticks', 'path cost', 'expanded', 'plans', 'failures', 'wall clock'],
      [
        [
          report.succeeded ? 'complete' : 'TIMED OUT',
          String(report.metrics.ticks),
          String(report.metrics.pathCost),
          String(report.metrics.expanded),
          String(report.metrics.plans),
          String(report.metrics.failures),
          `${elapsed.toFixed(1)}ms`,
        ],
      ],
    ),
  );
  console.log('');
  console.log(scenario.lesson);
  return report.succeeded ? 0 : 1;
}

function bench(asJson: boolean): number {
  const results = SCENARIOS.flatMap((scenario) =>
    PLANNER_IDS.map((planner) => {
      const started = performance.now();
      const report = runScenario(scenario, planner);
      return {
        scenario: scenario.id,
        planner,
        succeeded: report.succeeded,
        ...report.metrics,
        wallClockMs: Number((performance.now() - started).toFixed(2)),
      };
    }),
  );

  if (asJson) {
    console.log(JSON.stringify(results, null, 2));
    return 0;
  }

  console.log(
    table(
      ['scenario', 'planner', 'outcome', 'ticks', 'cost', 'expanded', 'ms'],
      results.map((result) => [
        result.scenario,
        result.planner,
        result.succeeded ? 'ok' : 'timeout',
        String(result.ticks),
        String(result.pathCost),
        String(result.expanded),
        result.wallClockMs.toFixed(1),
      ]),
    ),
  );
  return 0;
}

function record(scenarioId: string, plannerId: PlannerId): number {
  const scenario = scenarioById(scenarioId);
  if (scenario === undefined) {
    console.error(`Unknown scenario: ${scenarioId}`);
    return 1;
  }
  const report = runScenario(scenario, plannerId);
  process.stdout.write(
    encodeReplay({
      version: REPLAY_VERSION,
      scenario: scenario.id,
      planner: plannerId,
      intents: report.intents,
    }),
  );
  return 0;
}

function play(path: string): number {
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8');
  } catch (cause) {
    console.error(`Cannot read ${path}: ${cause instanceof Error ? cause.message : String(cause)}`);
    return 1;
  }

  try {
    const replay = parseReplay(contents);
    const state = playReplay(replay);
    console.log(
      `${replay.scenario} / ${replay.planner}: replayed ${String(replay.intents.length)} ticks, ` +
        `world now at tick ${String(state.tick)}`,
    );
    return 0;
  } catch (cause) {
    console.error(`Rejected ${path}: ${cause instanceof Error ? cause.message : String(cause)}`);
    return 1;
  }
}

function list(): number {
  console.log(
    table(
      ['scenario', 'objective', 'fails for'],
      SCENARIOS.map((scenario) => [
        scenario.id,
        scenario.objective.kind,
        scenario.expectedToFail.join(', ') || 'none',
      ]),
    ),
  );
  console.log('');
  console.log(`Planners: ${PLANNER_IDS.join(', ')}`);
  return 0;
}

function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;

  if (command === undefined || command === '--help' || command === '-h') {
    console.log(USAGE);
    return 0;
  }

  switch (command) {
    case 'run': {
      const [scenarioId, plannerArg = 'astar'] = rest;
      if (scenarioId === undefined) {
        console.error(USAGE);
        return 2;
      }
      if (!isPlannerId(plannerArg)) {
        console.error(`Unknown planner: ${plannerArg}`);
        return 2;
      }
      return runOne(scenarioId, plannerArg);
    }
    case 'record': {
      const [scenarioId, plannerArg = 'astar'] = rest;
      if (scenarioId === undefined) {
        console.error(USAGE);
        return 2;
      }
      if (!isPlannerId(plannerArg)) {
        console.error(`Unknown planner: ${plannerArg}`);
        return 2;
      }
      return record(scenarioId, plannerArg);
    }
    case 'play': {
      const [path] = rest;
      if (path === undefined) {
        console.error(USAGE);
        return 2;
      }
      return play(path);
    }
    case 'bench':
      return bench(rest.includes('--json'));
    case 'list':
      return list();
    default:
      console.error(`Unknown command: ${command}`);
      console.error(USAGE);
      return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
