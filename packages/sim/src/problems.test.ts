import { aStarSearch, uniformCostSearch, type SearchOutcome } from '@rationauts/agents';
import { parseMap, positionKey, type Position } from '@rationauts/core';
import { describe, expect, it } from 'vitest';
import {
  MAX_SURVEY_SITES,
  routingHeuristic,
  routingProblem,
  surveyHeuristic,
  surveyProblem,
} from './problems.js';

function found<S, A>(outcome: SearchOutcome<S, A>): Extract<SearchOutcome<S, A>, { found: true }> {
  if (!outcome.found) throw new Error(`Expected a solution, got ${outcome.reason}`);
  return outcome;
}

describe('routingProblem', () => {
  it('charges the entry cost of the tile being moved into', () => {
    const { grid } = parseMap('..,.');
    const problem = routingProblem(grid, { x: 0, y: 0 }, { x: 3, y: 0 });
    expect(found(uniformCostSearch(problem)).cost).toBe(1 + 8 + 1);
  });

  it('never routes through impassable terrain', () => {
    const { grid } = parseMap('.#.\n...');
    const problem = routingProblem(grid, { x: 0, y: 0 }, { x: 2, y: 0 });
    const result = found(uniformCostSearch(problem));
    expect(result.states.some((p) => p.x === 1 && p.y === 0)).toBe(false);
  });

  it('reports no route when the goal is walled off', () => {
    const { grid } = parseMap('.#.');
    expect(uniformCostSearch(routingProblem(grid, { x: 0, y: 0 }, { x: 2, y: 0 })).found).toBe(
      false,
    );
  });
});

describe('routingHeuristic', () => {
  it('never overestimates the true remaining cost', () => {
    // Checked against uniform-cost search from every reachable tile, which is the
    // definition of admissible rather than a proxy for it.
    const { grid } = parseMap(`
..........
.,,,,####.
..........
.####,,,,.
..........
`);
    const goal: Position = { x: 9, y: 4 };
    const heuristic = routingHeuristic(goal);

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const from = { x, y };
        const outcome = uniformCostSearch(routingProblem(grid, from, goal));
        if (!outcome.found) continue;
        expect(heuristic(from)).toBeLessThanOrEqual(outcome.cost);
      }
    }
  });

  it('is zero at the goal', () => {
    expect(routingHeuristic({ x: 3, y: 3 })({ x: 3, y: 3 })).toBe(0);
  });
});

describe('surveyProblem', () => {
  const MAP = `
.......
.T...T.
.......
.T...T.
.......
`;

  it('requires every site to be visited before returning home', () => {
    const { grid, markers } = parseMap(MAP);
    const sites = markers.get('T') ?? [];
    const home: Position = { x: 3, y: 4 };
    const problem = surveyProblem(grid, home, sites, home);
    const result = found(aStarSearch(problem, surveyHeuristic(sites, home)));

    const walked = new Set(result.states.map((state) => positionKey(state.position)));
    for (const site of sites) expect(walked.has(positionKey(site))).toBe(true);
    expect(result.states.at(-1)?.position).toEqual(home);
  });

  it('is not satisfied by standing at home with sites outstanding', () => {
    const { grid, markers } = parseMap(MAP);
    const sites = markers.get('T') ?? [];
    const home: Position = { x: 3, y: 4 };
    const problem = surveyProblem(grid, home, sites, home);
    expect(problem.isGoal(problem.initial)).toBe(false);
  });

  it('marks a site visited as soon as the tour starts on one', () => {
    const { grid, markers } = parseMap(MAP);
    const sites = markers.get('T') ?? [];
    const start = sites[0];
    expect(start).toBeDefined();
    if (start === undefined) return;
    const problem = surveyProblem(grid, start, sites, { x: 3, y: 4 });
    expect(problem.initial.visited).not.toBe(0);
  });

  it('refuses more sites than the bitmask can hold', () => {
    const { grid } = parseMap('....\n....');
    const tooMany = Array.from({ length: MAX_SURVEY_SITES + 1 }, () => ({ x: 0, y: 0 }));
    expect(() => surveyProblem(grid, { x: 0, y: 0 }, tooMany, { x: 0, y: 0 })).toThrow(RangeError);
  });
});

describe('surveyHeuristic', () => {
  it('never overestimates, checked against uniform-cost search', () => {
    // Small maps only: the oracle is a full uniform-cost search over a state space of
    // tiles x 2^sites, which is exactly what makes it trustworthy and slow.
    const { grid, markers } = parseMap(`
......
.T..T.
......
.T....
......
`);
    const sites = markers.get('T') ?? [];
    const home: Position = { x: 0, y: 4 };
    const heuristic = surveyHeuristic(sites, home);

    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const problem = surveyProblem(grid, { x, y }, sites, home);
        const outcome = uniformCostSearch(problem);
        if (!outcome.found) continue;
        expect(heuristic(problem.initial)).toBeLessThanOrEqual(outcome.cost);
      }
    }
  });

  it('collapses to the trip home once every site is visited', () => {
    const sites: Position[] = [{ x: 1, y: 1 }];
    const home: Position = { x: 4, y: 4 };
    const heuristic = surveyHeuristic(sites, home);
    expect(heuristic({ position: { x: 4, y: 0 }, visited: 0b1 })).toBe(4);
  });

  it('accounts for the detour to an unvisited site', () => {
    const sites: Position[] = [{ x: 5, y: 0 }];
    const home: Position = { x: 0, y: 0 };
    const heuristic = surveyHeuristic(sites, home);
    // From x=3, the trip home alone is 3, but the tour must first reach the site at
    // x=5 and come back past here, so the real lower bound is 2 + 5.
    expect(heuristic({ position: { x: 3, y: 0 }, visited: 0 })).toBe(7);
    // Once that site is visited, only the trip home remains.
    expect(heuristic({ position: { x: 3, y: 0 }, visited: 0b1 })).toBe(3);
  });
});

describe('A* on the survey problem', () => {
  it('matches uniform-cost search on cost while expanding fewer states', () => {
    const { grid, markers } = parseMap(`
........
.T....T.
........
........
.T....T.
........
`);
    const sites = markers.get('T') ?? [];
    const home: Position = { x: 0, y: 5 };
    const problem = surveyProblem(grid, home, sites, home);
    const optimal = found(uniformCostSearch(problem));
    const informed = found(aStarSearch(problem, surveyHeuristic(sites, home)));
    expect(informed.cost).toBe(optimal.cost);
    expect(informed.stats.expanded).toBeLessThan(optimal.stats.expanded);
  });
});
