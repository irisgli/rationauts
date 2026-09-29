import {
  createWorld,
  emptyStore,
  parseMap,
  type Position,
  type ResourceKind,
  type WorldState,
} from '@rationauts/core';
import type { Objective } from './controller.js';
import type { PlannerId } from './navigators.js';

/**
 * The difficulty ladder.
 *
 * Every scenario exists to make one planner fail visibly so the next one has a reason
 * to exist. `expectedToFail` is not documentation — the test suite asserts it, which
 * means a change that quietly makes breadth-first search good enough on `mudflats`
 * breaks the build rather than hollowing out the lesson.
 *
 * Map symbols: `.` plains (cost 1), `^` forest (3), `,` mud (8), `#` rock, `~` water,
 * `B` bot, `D` depot, `T` tree.
 */
export interface Scenario {
  readonly id: string;
  readonly name: string;
  /** What the world does to you. Shown in the client. */
  readonly brief: string;
  /** Which module this scenario argues for. */
  readonly lesson: string;
  readonly map: string;
  readonly objective: Objective;
  readonly quota: Readonly<Partial<Record<ResourceKind, number>>>;
  readonly maxTicks: number;
  readonly seed: number;
  /** Planners that provably cannot finish this scenario within `maxTicks`. */
  readonly expectedToFail: readonly PlannerId[];
}

export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'open-field',
    name: 'Open Field',
    brief: 'Flat ground, one grove, one depot, nothing in the way.',
    lesson:
      'A reflex agent is enough when nothing obstructs it. Do not pay for search you do not need.',
    map: `
..........
..T.......
..........
.....B....
..........
.......D..
..........
`,
    objective: { kind: 'deliver' },
    quota: { wood: 3 },
    maxTicks: 400,
    seed: 1,
    expectedToFail: [],
  },
  {
    id: 'wall-gap',
    name: 'Wall Gap',
    brief: 'A ridge stands between the grove and the depot, with one gap in it.',
    lesson:
      'Hill-climbing stops in the pocket: every legal move increases the distance, and a reflex agent has no memory to escape with. Search does not care about local minima.',
    map: `
###########
#....#....#
#.T..#....#
#....#....#
#.B###....#
#....#..D.#
#....#....#
#.........#
###########
`,
    objective: { kind: 'deliver' },
    quota: { wood: 2 },
    maxTicks: 500,
    seed: 2,
    expectedToFail: ['reflex'],
  },
  {
    id: 'mudflats',
    name: 'Mudflats',
    brief: 'The direct route crosses a mud flat. Mud costs eight times what plains cost.',
    lesson:
      'Breadth-first search finds the route with the fewest steps, which is the slowest route here by a wide margin. Counting steps is not the same as counting cost.',
    map: `
#############
#...........#
#.T.,,,,,.D.#
#...,,,,,...#
#.B.,,,,,...#
#...........#
#############
`,
    objective: { kind: 'deliver' },
    quota: { wood: 2 },
    maxTicks: 600,
    seed: 3,
    expectedToFail: [],
  },
  {
    id: 'great-plain',
    name: 'Great Plain',
    brief: 'A wide, nearly empty map. Both optimal planners find exactly the same route.',
    lesson:
      'Uniform-cost search and A* return identical paths here, at identical cost. The only difference is how many tiles each had to examine to be certain — which is the entire argument for a heuristic, and it is invisible unless you count.',
    map: `
................................
................................
...T............................
.........#......................
.........#.............##.......
.........##.....................
................................
................................
.............................D..
......##.........#..............
.................#..............
.................##.............
................................
............###...........#.....
................................
....B...........................
................................
................................
`,
    objective: { kind: 'deliver' },
    quota: { wood: 2 },
    maxTicks: 1200,
    seed: 4,
    expectedToFail: [],
  },
  {
    id: 'four-groves',
    name: 'Four Groves',
    brief: 'Survey all four groves and report back to the depot.',
    lesson:
      'There is no single goal tile any more. The state has to carry which groves have been visited, and the same A* solves it unchanged — which is the point of writing the algorithm against a problem rather than against a grid.',
    map: `
#############
#.T.......T.#
#...........#
#....###....#
#..D.###....#
#....###....#
#.....B.....#
#.T.......T.#
#############
`,
    objective: { kind: 'survey' },
    quota: {},
    maxTicks: 900,
    seed: 5,
    expectedToFail: ['reflex', 'dfs'],
  },
];

export function scenarioById(id: string): Scenario | undefined {
  return SCENARIOS.find((scenario) => scenario.id === id);
}

/** Markers the scenario map format understands. */
const BOT = 'B';
const DEPOT = 'D';
const TREE = 'T';

/**
 * Builds a scenario's initial world.
 *
 * @throws SyntaxError when the map lacks a bot or a depot, which is always a typo in
 *   the map rather than a condition worth handling at runtime.
 */
export function buildWorld(scenario: Scenario): WorldState {
  const { grid, markers } = parseMap(scenario.map);
  const bots = markers.get(BOT) ?? [];
  const depots = markers.get(DEPOT) ?? [];
  const trees = markers.get(TREE) ?? [];

  if (bots.length === 0) throw new SyntaxError(`Scenario ${scenario.id} has no bot marker`);
  if (depots.length === 0) throw new SyntaxError(`Scenario ${scenario.id} has no depot marker`);

  return createWorld({
    grid,
    bots: bots.map((position: Position, index: number) => ({
      id: `bot-${String(index + 1)}`,
      position,
      carrying: null,
      cooldown: 0,
    })),
    nodes: trees.map((position: Position, index: number) => ({
      id: `grove-${String(index + 1)}`,
      position,
      kind: 'wood' as const,
      // Surveying visits each grove once; delivery draws repeatedly from one.
      remaining: scenario.objective.kind === 'survey' ? 1 : 99,
    })),
    depots: depots.map((position: Position, index: number) => ({
      id: `depot-${String(index + 1)}`,
      position,
      stored: emptyStore(),
    })),
    quota: scenario.quota,
    seed: scenario.seed,
  });
}
