import {
  DIRECTIONS,
  enterCost,
  isWalkable,
  manhattan,
  MIN_STEP_COST,
  positionKey,
  samePosition,
  translate,
  type Direction,
  type Grid,
  type Position,
} from '@rationauts/core';
import type { Heuristic, SearchProblem } from '@rationauts/agents';

/**
 * Adapters expressing Rationauts' problems in the terms `@rationauts/agents`
 * understands.
 *
 * This module is the seam described in ADR 4: the algorithm library knows nothing
 * about grids or bots, and everything it would need to know lives here instead.
 */

/** Routing a single bot from one tile to another. */
export function routingProblem(
  grid: Grid,
  start: Position,
  goal: Position,
): SearchProblem<Position, Direction> {
  return {
    initial: start,
    isGoal: (position) => samePosition(position, goal),
    actions: (position) =>
      DIRECTIONS.filter((direction) => isWalkable(grid, translate(position, direction))),
    result: translate,
    stepCost: (_position, _direction, next) => enterCost(grid, next),
    key: positionKey,
  };
}

/**
 * Manhattan distance scaled by the cheapest possible step.
 *
 * The scaling is what makes this admissible rather than merely plausible. The
 * heuristic must estimate remaining *cost*, but Manhattan distance counts remaining
 * *steps*; multiplying by the minimum cost per step converts between them without
 * ever overestimating. It is a no-op while the cheapest terrain costs 1, and it stops
 * being one the moment the cost table changes — which is exactly when a silent
 * admissibility violation would be hardest to find.
 */
export function routingHeuristic(goal: Position): Heuristic<Position> {
  return (position) => manhattan(position, goal) * MIN_STEP_COST;
}

/**
 * Surveying: visit every listed site in any order, then return to base.
 *
 * The state is a position *and* the set of sites already visited, which is the point
 * of the exercise. Single-goal routing cannot express this — there is no one tile
 * that is the goal — and yet the same `aStarSearch` solves it unchanged, because the
 * algorithm was never told what a state is.
 *
 * Visited sites are tracked as a bitmask rather than a set, so that `key` is cheap
 * and states compare by value. That caps a survey at 30 sites, which is far beyond
 * anything the search would finish anyway: the state space is `tiles * 2^sites`.
 */
export interface SurveyState {
  readonly position: Position;
  /** Bit `i` is set once `sites[i]` has been visited. */
  readonly visited: number;
}

export const MAX_SURVEY_SITES = 30;

export function surveyProblem(
  grid: Grid,
  start: Position,
  sites: readonly Position[],
  home: Position,
): SearchProblem<SurveyState, Direction> {
  if (sites.length > MAX_SURVEY_SITES) {
    throw new RangeError(
      `A survey may cover at most ${String(MAX_SURVEY_SITES)} sites, received ${String(sites.length)}`,
    );
  }
  const complete = (1 << sites.length) - 1;

  const visitedAt = (position: Position, previous: number): number => {
    let next = previous;
    sites.forEach((site, index) => {
      if (samePosition(site, position)) next |= 1 << index;
    });
    return next;
  };

  return {
    initial: { position: start, visited: visitedAt(start, 0) },
    isGoal: (state) => state.visited === complete && samePosition(state.position, home),
    actions: (state) =>
      DIRECTIONS.filter((direction) => isWalkable(grid, translate(state.position, direction))),
    result: (state, direction) => {
      const position = translate(state.position, direction);
      return { position, visited: visitedAt(position, state.visited) };
    },
    stepCost: (_state, _direction, next) => enterCost(grid, next.position),
    key: (state) => `${positionKey(state.position)}|${String(state.visited)}`,
  };
}

/**
 * An admissible heuristic for {@link surveyProblem}.
 *
 * For each site still unvisited, any completion of the tour must travel from here to
 * that site and later from that site to base. Manhattan distance is a lower bound on
 * each of those legs, so their sum is a lower bound on the whole remaining tour, and
 * the largest such bound over unvisited sites is still a lower bound. Once every site
 * is visited, the only remaining obligation is the trip home.
 */
export function surveyHeuristic(
  sites: readonly Position[],
  home: Position,
): Heuristic<SurveyState> {
  return (state) => {
    let bound = manhattan(state.position, home);
    sites.forEach((site, index) => {
      if ((state.visited & (1 << index)) !== 0) return;
      const viaSite = manhattan(state.position, site) + manhattan(site, home);
      if (viaSite > bound) bound = viaSite;
    });
    return bound * MIN_STEP_COST;
  };
}
