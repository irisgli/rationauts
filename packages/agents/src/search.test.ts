import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  eightPuzzle,
  manhattanHeuristic,
  misplacedTiles,
  scramble,
  SOLVED,
} from './__fixtures__/eight-puzzle.js';
import {
  costAt,
  gridProblem,
  makeRandom,
  manhattan,
  parseCostGrid,
  randomCostGrid,
  trueCostToGo,
  type Cell,
  type CostGrid,
} from './__fixtures__/grid.js';
import { zeroHeuristic, type SearchOutcome } from './problem.js';
import {
  aStarSearch,
  breadthFirstSearch,
  depthFirstSearch,
  greedyBestFirstSearch,
  uniformCostSearch,
} from './search.js';

function expectFound<S, A>(
  outcome: SearchOutcome<S, A>,
): Extract<SearchOutcome<S, A>, { found: true }> {
  if (!outcome.found) throw new Error(`Expected a solution, got: ${outcome.reason}`);
  return outcome;
}

/**
 * A detour map. Going straight for the goal crosses a single 9-cost cell in two
 * steps; walking around the block takes six steps but costs six. Fewest steps and
 * cheapest route are therefore different answers, which is the whole contrast
 * between breadth-first and uniform-cost search.
 */
const DETOUR = `
S9G
1#1
111
`;

describe('breadthFirstSearch', () => {
  it('finds the route with the fewest steps', () => {
    const { grid, start, goal } = parseCostGrid('S11\n111\n11G');
    const result = expectFound(breadthFirstSearch(gridProblem(grid, start, goal)));
    expect(result.path).toHaveLength(4);
  });

  it('is not optimal in cost', () => {
    // The point of the `mudflats` scenario, in miniature: fewest steps is not
    // cheapest when terrain costs differ.
    const { grid, start, goal } = parseCostGrid(DETOUR);
    const problem = gridProblem(grid, start, goal);
    const bfs = expectFound(breadthFirstSearch(problem));
    const ucs = expectFound(uniformCostSearch(problem));
    expect(bfs.path.length).toBeLessThanOrEqual(ucs.path.length);
    expect(bfs.cost).toBeGreaterThan(ucs.cost);
  });

  it('reports exhaustion when the goal is walled off', () => {
    const { grid, start, goal } = parseCostGrid('S#G');
    const outcome = breadthFirstSearch(gridProblem(grid, start, goal));
    expect(outcome.found).toBe(false);
    if (!outcome.found) expect(outcome.reason).toBe('exhausted');
  });

  it('solves a problem whose initial state is already a goal', () => {
    const { grid, start } = parseCostGrid('S1\n1G');
    const result = expectFound(breadthFirstSearch(gridProblem(grid, start, start)));
    expect(result.path).toEqual([]);
    expect(result.cost).toBe(0);
  });
});

describe('depthFirstSearch', () => {
  it('finds a path but not necessarily a short one', () => {
    const { grid, start, goal } = parseCostGrid(DETOUR);
    const problem = gridProblem(grid, start, goal);
    const dfs = expectFound(depthFirstSearch(problem));
    const bfs = expectFound(breadthFirstSearch(problem));
    expect(dfs.path.length).toBeGreaterThanOrEqual(bfs.path.length);
  });

  it('terminates on a cyclic state space', () => {
    // Grid graphs are cyclic; without the visited set this would not return.
    const { grid, start, goal } = parseCostGrid('S111\n1111\n1111\n111G');
    expect(
      expectFound(depthFirstSearch(gridProblem(grid, start, goal))).path.length,
    ).toBeGreaterThan(0);
  });
});

describe('uniformCostSearch', () => {
  it('finds the cheapest path, not the shortest', () => {
    const { grid, start, goal } = parseCostGrid(DETOUR);
    const result = expectFound(uniformCostSearch(gridProblem(grid, start, goal)));
    // Every cell on the cheap route costs 1, and the route never enters a 9-cell.
    expect(result.states.every((cell) => costAt(grid, cell) <= 1)).toBe(true);
  });

  it('respects an expansion budget', () => {
    const { grid, start, goal } = randomCostGrid(7, 40, 40);
    const outcome = uniformCostSearch(gridProblem(grid, start, goal), { maxExpansions: 5 });
    expect(outcome.found).toBe(false);
    if (!outcome.found) expect(outcome.reason).toBe('limit-reached');
  });
});

describe('aStarSearch', () => {
  it('matches uniform-cost search on cost while expanding no more states', () => {
    // The central claim of the Search tier, checked against an oracle rather than a
    // recorded number: A* is not a different answer, it is the same answer for less
    // work. `great-plain` exists to make this visible in the client.
    for (const seed of [1, 2, 3, 5, 8, 13, 21]) {
      const { grid, start, goal } = randomCostGrid(seed, 30, 30);
      const problem = gridProblem(grid, start, goal);
      const ucs = expectFound(uniformCostSearch(problem));
      const astar = expectFound(aStarSearch(problem, (cell) => manhattan(cell, goal)));
      expect(astar.cost).toBe(ucs.cost);
      expect(astar.stats.expanded).toBeLessThanOrEqual(ucs.stats.expanded);
    }
  });

  it('degenerates to uniform-cost search with a zero heuristic', () => {
    const { grid, start, goal } = randomCostGrid(11, 20, 20);
    const problem = gridProblem(grid, start, goal);
    const ucs = expectFound(uniformCostSearch(problem));
    const astar = expectFound(aStarSearch(problem, zeroHeuristic));
    expect(astar.path).toEqual(ucs.path);
    expect(astar.stats.expanded).toBe(ucs.stats.expanded);
  });

  it('stays optimal under an admissible but inconsistent heuristic', () => {
    // Admissible heuristics that violate the triangle inequality are easy to write by
    // accident. The implementation re-opens a state when a cheaper route to it turns
    // up later, which is what keeps this case optimal rather than merely fast.
    const { grid, start, goal } = randomCostGrid(4, 20, 20);
    const problem = gridProblem(grid, start, goal);
    const exact = trueCostToGo(grid, goal);
    const spiky = (cell: Cell): number => {
      const truth = exact.get(`${String(cell.x)},${String(cell.y)}`) ?? 0;
      // Admissible everywhere (never exceeds truth), but wildly uneven between
      // neighbours, so h jumps around and consistency fails.
      return (cell.x + cell.y) % 3 === 0 ? truth : 0;
    };
    expect(expectFound(aStarSearch(problem, spiky)).cost).toBe(
      expectFound(uniformCostSearch(problem)).cost,
    );
  });
});

describe('greedyBestFirstSearch', () => {
  it('is fast and not optimal', () => {
    const { grid, start, goal } = parseCostGrid(DETOUR);
    const problem = gridProblem(grid, start, goal);
    const greedy = expectFound(greedyBestFirstSearch(problem, (cell) => manhattan(cell, goal)));
    const optimal = expectFound(uniformCostSearch(problem));
    expect(greedy.cost).toBeGreaterThanOrEqual(optimal.cost);
    expect(greedy.stats.expanded).toBeLessThanOrEqual(optimal.stats.expanded);
  });
});

describe('heuristic admissibility', () => {
  it('manhattan distance never exceeds true cost-to-go on a unit-cost grid', () => {
    // On a grid whose minimum step cost is 1, any path must make at least |dx| + |dy|
    // moves, each costing at least 1. That is the whole admissibility argument, and it
    // is checked here against exhaustively computed ground truth.
    const grid: CostGrid = {
      width: 12,
      height: 12,
      costs: Array.from({ length: 144 }, () => 1),
    };
    const goal: Cell = { x: 11, y: 11 };
    const exact = trueCostToGo(grid, goal);
    for (const [key, truth] of exact) {
      const [x = '0', y = '0'] = key.split(',');
      const estimate = manhattan({ x: Number(x), y: Number(y) }, goal);
      expect(estimate).toBeLessThanOrEqual(truth);
    }
  });
});

describe('the algorithms are independent of any particular domain', () => {
  it('solves the eight-puzzle, whose states are not grid positions', () => {
    // Scrambled from the goal rather than hand-written: exactly half of all boards
    // are unreachable from the solved state, and picking one by hand is a coin flip.
    const board = scramble(makeRandom(5), 20);
    const result = expectFound(aStarSearch(eightPuzzle(board), manhattanHeuristic()));
    expect(result.states.at(-1)).toBe(SOLVED);
    // Replaying the returned actions must actually reach the goal.
    const problem = eightPuzzle(board);
    const replayed = result.path.reduce((state, action) => problem.result(state, action), board);
    expect(replayed).toBe(SOLVED);
  });

  it('agrees with breadth-first search on optimal solution length', () => {
    // Unit costs, so BFS is optimal and provides ground truth that A* must match.
    const random = makeRandom(99);
    for (let trial = 0; trial < 6; trial++) {
      const board = scramble(random, 12);
      const bfs = expectFound(breadthFirstSearch(eightPuzzle(board)));
      const astar = expectFound(aStarSearch(eightPuzzle(board), manhattanHeuristic()));
      expect(astar.path.length).toBe(bfs.path.length);
    }
  });

  it('expands fewer states with the stronger of two admissible heuristics', () => {
    // Manhattan dominates misplaced-tiles: it is never smaller, so it never expands
    // more. This is the dominance argument, tested rather than asserted.
    const random = makeRandom(2024);
    for (let trial = 0; trial < 5; trial++) {
      const board = scramble(random, 16);
      const strong = aStarSearch(eightPuzzle(board), manhattanHeuristic());
      const weak = aStarSearch(eightPuzzle(board), misplacedTiles());
      expect(strong.stats.expanded).toBeLessThanOrEqual(weak.stats.expanded);
    }
  });
});

describe('search invariants', () => {
  it('returns a path that is actually traversable, for every algorithm', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 300 }), (seed) => {
        const { grid, start, goal } = randomCostGrid(seed, 12, 12);
        const problem = gridProblem(grid, start, goal);
        const outcomes = [
          breadthFirstSearch(problem),
          depthFirstSearch(problem),
          uniformCostSearch(problem),
          aStarSearch(problem, (cell) => manhattan(cell, goal)),
        ];
        return outcomes.every((outcome) => {
          if (!outcome.found) return outcome.reason === 'exhausted';
          let cell = start;
          let cost = 0;
          for (const action of outcome.path) {
            const next = problem.result(cell, action);
            cost += problem.stepCost(cell, action, next);
            cell = next;
          }
          return problem.isGoal(cell) && Math.abs(cost - outcome.cost) < 1e-9;
        });
      }),
      { numRuns: 60 },
    );
  });

  it('never reports a cheaper path than uniform-cost search finds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 300 }), (seed) => {
        const { grid, start, goal } = randomCostGrid(seed, 12, 12);
        const problem = gridProblem(grid, start, goal);
        const optimal = uniformCostSearch(problem);
        const astar = aStarSearch(problem, (cell) => manhattan(cell, goal));
        if (!optimal.found || !astar.found) return optimal.found === astar.found;
        return astar.cost === optimal.cost;
      }),
      { numRuns: 60 },
    );
  });
});
