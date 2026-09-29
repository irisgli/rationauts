import type { SearchProblem } from '../problem.js';

/**
 * A weighted-grid search problem, defined without reference to `@rationauts/core`.
 *
 * The duplication with the engine's own grid is deliberate. `@rationauts/agents`
 * depends on nothing, and its tests must not smuggle a dependency in through the back
 * door: if the algorithms were validated against the engine's grid, a bug in the
 * engine's cost model would make the search tests agree with it and pass.
 *
 * @see docs/adr/0004-algorithms-are-game-agnostic.md
 */

export interface Cell {
  readonly x: number;
  readonly y: number;
}

export type Move = 'north' | 'east' | 'south' | 'west';

export const MOVES: readonly Move[] = ['north', 'east', 'south', 'west'];

const DELTA: Record<Move, Cell> = {
  north: { x: 0, y: -1 },
  east: { x: 1, y: 0 },
  south: { x: 0, y: 1 },
  west: { x: -1, y: 0 },
};

export interface CostGrid {
  readonly width: number;
  readonly height: number;
  /** Cost of entering each cell, row-major. `Infinity` marks a wall. */
  readonly costs: readonly number[];
}

/**
 * Parses a compact ASCII cost map.
 *
 * Digits `1`-`9` are the cost of entering that cell, `#` is a wall, and `S` and `G`
 * mark the start and goal (both cost 1). Writing cost landscapes inline keeps each
 * test's fixture visible next to its assertion.
 */
export function parseCostGrid(ascii: string): {
  grid: CostGrid;
  start: Cell;
  goal: Cell;
} {
  const rows = ascii.split('\n').filter((row) => row.trim().length > 0);
  const width = Math.max(...rows.map((row) => row.length));
  const costs: number[] = [];
  let start: Cell | undefined;
  let goal: Cell | undefined;

  rows.forEach((row, y) => {
    for (let x = 0; x < width; x++) {
      const symbol = row[x] ?? '#';
      if (symbol === '#') {
        costs.push(Number.POSITIVE_INFINITY);
        continue;
      }
      if (symbol === 'S') start = { x, y };
      if (symbol === 'G') goal = { x, y };
      const digit = Number.parseInt(symbol, 10);
      costs.push(Number.isNaN(digit) ? 1 : digit);
    }
  });

  if (start === undefined || goal === undefined) {
    throw new Error('Cost map must contain both an S and a G');
  }
  return { grid: { width, height: rows.length, costs }, start, goal };
}

export function costAt(grid: CostGrid, cell: Cell): number {
  if (cell.x < 0 || cell.y < 0 || cell.x >= grid.width || cell.y >= grid.height) {
    return Number.POSITIVE_INFINITY;
  }
  return grid.costs[cell.y * grid.width + cell.x] ?? Number.POSITIVE_INFINITY;
}

/** Builds a single-goal routing problem over a cost grid. */
export function gridProblem(grid: CostGrid, start: Cell, goal: Cell): SearchProblem<Cell, Move> {
  return {
    initial: start,
    isGoal: (cell) => cell.x === goal.x && cell.y === goal.y,
    actions: (cell) => MOVES.filter((move) => Number.isFinite(costAt(grid, translate(cell, move)))),
    result: (cell, move) => translate(cell, move),
    stepCost: (_cell, _move, next) => costAt(grid, next),
    key: (cell) => `${String(cell.x)},${String(cell.y)}`,
  };
}

export function translate(cell: Cell, move: Move): Cell {
  const delta = DELTA[move];
  return { x: cell.x + delta.x, y: cell.y + delta.y };
}

export function manhattan(a: Cell, b: Cell): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * A tiny xorshift generator, so fixtures can be randomised reproducibly without
 * importing the engine's PRNG.
 */
export function makeRandom(seed: number): () => number {
  let state = (seed | 0) === 0 ? 0x9e3779b9 : seed | 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 1_000_000) / 1_000_000;
  };
}

/**
 * Generates a random cost grid with walls, guaranteeing that the goal is reachable
 * by leaving the top row and the right column clear.
 */
export function randomCostGrid(
  seed: number,
  width: number,
  height: number,
  wallDensity = 0.25,
): { grid: CostGrid; start: Cell; goal: Cell } {
  const random = makeRandom(seed);
  const costs: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const onGuaranteedPath = y === 0 || x === width - 1;
      if (!onGuaranteedPath && random() < wallDensity) {
        costs.push(Number.POSITIVE_INFINITY);
      } else {
        costs.push(1 + Math.floor(random() * 9));
      }
    }
  }
  return {
    grid: { width, height, costs },
    start: { x: 0, y: 0 },
    goal: { x: width - 1, y: height - 1 },
  };
}

/**
 * True cost-to-go from every cell to `goal`, by uniform-cost search run backwards.
 *
 * This is the oracle admissibility is checked against. Costs are for *entering* a
 * cell, so the reverse search accumulates the cost of the cell it came from.
 */
export function trueCostToGo(grid: CostGrid, goal: Cell): Map<string, number> {
  const best = new Map<string, number>();
  const key = (cell: Cell): string => `${String(cell.x)},${String(cell.y)}`;
  const queue: { cell: Cell; cost: number }[] = [{ cell: goal, cost: 0 }];
  best.set(key(goal), 0);

  while (queue.length > 0) {
    queue.sort((a, b) => a.cost - b.cost);
    const current = queue.shift();
    if (current === undefined) break;
    if ((best.get(key(current.cell)) ?? Number.POSITIVE_INFINITY) < current.cost) continue;

    for (const move of MOVES) {
      const neighbour = translate(current.cell, move);
      if (!Number.isFinite(costAt(grid, neighbour))) continue;
      // Stepping from `neighbour` into `current.cell` costs the entry price of
      // `current.cell`, which is what a forward search would have paid.
      const cost = current.cost + costAt(grid, current.cell);
      if (cost < (best.get(key(neighbour)) ?? Number.POSITIVE_INFINITY)) {
        best.set(key(neighbour), cost);
        queue.push({ cell: neighbour, cost });
      }
    }
  }
  return best;
}
