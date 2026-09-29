import {
  DIRECTIONS,
  directionBetween,
  isWalkable,
  manhattan,
  positionKey,
  samePosition,
  translate,
  type BotId,
  type Direction,
  type Intent,
  type Position,
  type WorldState,
} from '@rationauts/core';
import { plannerById, type PlannerId } from './navigators.js';
import { routingHeuristic, routingProblem, surveyHeuristic, surveyProblem } from './problems.js';
import { EMPTY_STATS, type PlanTelemetry } from './telemetry.js';

/**
 * What a bot is trying to achieve. Scenarios choose one.
 *
 * `deliver` is ordinary logistics: fetch from a grove, carry to a depot, repeat.
 * `survey` is the multi-goal case, visiting every grove once and then returning to
 * base, and exists to show that the same A\* solves a problem whose state is not a
 * position at all.
 */
export type Objective = { readonly kind: 'deliver' } | { readonly kind: 'survey' };

/** A bot's brain: one intent per tick, plus whatever it last worked out. */
export interface Controller {
  decide(state: WorldState, botId: BotId): Intent;
  readonly lastPlan: PlanTelemetry | null;
}

function botOf(state: WorldState, botId: BotId): WorldState['bots'][number] | undefined {
  return state.bots.find((candidate) => candidate.id === botId);
}

/** The nearest depot by straight-line distance. Every scenario has exactly one. */
function nearestDepot(state: WorldState, from: Position): Position | undefined {
  let best: Position | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const depot of state.depots) {
    const distance = manhattan(from, depot.position);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = depot.position;
    }
  }
  return best;
}

/** Groves that still hold something worth carrying away. */
function harvestableGroves(state: WorldState): readonly Position[] {
  return state.nodes.filter((node) => node.remaining > 0).map((node) => node.position);
}

/**
 * Every grove on the map, harvested or not.
 *
 * Surveying is about *visiting*, not taking. A surveyed grove is not consumed, so
 * `remaining` is the wrong thing to ask about.
 */
export function surveySites(state: WorldState): readonly Position[] {
  return state.nodes.map((node) => node.position);
}

function nearestTo(from: Position, candidates: readonly Position[]): Position | undefined {
  let best: Position | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const distance = manhattan(from, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }
  return best;
}

type TargetAction = 'harvest' | 'deposit' | 'visit' | 'finish';

interface Target {
  readonly position: Position;
  readonly action: TargetAction;
}

/**
 * Picks what to head for next.
 *
 * `visited` is the bot's own memory of where it has been. It belongs to the bot
 * rather than to the world: a grove does not change when someone walks past it, and
 * modelling "surveyed" as world state would mean two bots could not survey
 * independently.
 */
function chooseTarget(
  state: WorldState,
  from: Position,
  carrying: boolean,
  objective: Objective,
  visited: ReadonlySet<string>,
): Target | null {
  if (objective.kind === 'survey') {
    const remaining = surveySites(state).filter((site) => !visited.has(positionKey(site)));
    const nearest = nearestTo(from, remaining);
    if (nearest !== undefined) return { position: nearest, action: 'visit' };
    const depot = nearestDepot(state, from);
    return depot === undefined ? null : { position: depot, action: 'finish' };
  }

  if (carrying) {
    const depot = nearestDepot(state, from);
    return depot === undefined ? null : { position: depot, action: 'deposit' };
  }
  const nearest = nearestTo(from, harvestableGroves(state));
  return nearest === undefined ? null : { position: nearest, action: 'harvest' };
}

/** The intent to issue once a bot is standing on its target. */
function actOnArrival(action: TargetAction, botId: BotId): Intent {
  switch (action) {
    case 'harvest':
      return { kind: 'harvest', bot: botId };
    case 'deposit':
      return { kind: 'deposit', bot: botId };
    case 'visit':
    case 'finish':
      // Surveying consumes nothing; arriving *is* the action.
      return { kind: 'wait', bot: botId };
  }
}

/**
 * A reflex agent: one step of lookahead, no map, no plan.
 *
 * It sees only the four tiles it could move to and takes whichever is walkable and
 * reduces the straight-line distance to its target the most. That is genuinely enough
 * on open ground, which is why `open-field` is winnable without installing anything.
 *
 * It is also hill-climbing, so it stops dead in any concave obstacle: every legal
 * move increases the distance, and there is no memory with which to notice it has
 * been here before. `wall-gap` is a pocket shaped to produce exactly that, and
 * watching the bot sit in it is the argument for installing search.
 */
export function createReflexController(objective: Objective): Controller {
  let lastPlan: PlanTelemetry | null = null;
  const visited = new Set<string>();

  return {
    get lastPlan() {
      return lastPlan;
    },
    decide(state, botId): Intent {
      const bot = botOf(state, botId);
      if (bot === undefined) return { kind: 'wait', bot: botId };
      visited.add(positionKey(bot.position));

      const target = chooseTarget(state, bot.position, bot.carrying !== null, objective, visited);
      if (target === null) return { kind: 'wait', bot: botId };
      if (samePosition(bot.position, target.position)) return actOnArrival(target.action, botId);

      let chosen: Direction | null = null;
      let bestDistance = manhattan(bot.position, target.position);
      for (const direction of DIRECTIONS) {
        const next = translate(bot.position, direction);
        if (!isWalkable(state.grid, next)) continue;
        const distance = manhattan(next, target.position);
        if (distance < bestDistance) {
          bestDistance = distance;
          chosen = direction;
        }
      }

      lastPlan = {
        planner: 'reflex',
        from: bot.position,
        to: target.position,
        found: chosen !== null,
        cost: 0,
        steps: chosen === null ? 0 : 1,
        stats: EMPTY_STATS,
        route: chosen === null ? [] : [bot.position, translate(bot.position, chosen)],
        directions: chosen === null ? [] : [chosen],
        // A reflex agent examines the four tiles it can reach and nothing else. The
        // overlay showing that against A*'s spread is the clearest single picture of
        // what search actually buys.
        explored: DIRECTIONS.map((direction) => translate(bot.position, direction)).filter(
          (candidate) => isWalkable(state.grid, candidate),
        ),
      };

      // Strictly downhill only. Allowing a sideways move would let it escape some
      // pockets, and would also stop it being a reflex agent.
      return chosen === null
        ? { kind: 'wait', bot: botId }
        : { kind: 'move', bot: botId, direction: chosen };
    },
  };
}

/**
 * A planning controller: works out a route, then follows it.
 *
 * The route is held as **remaining waypoints**, and a waypoint is only dropped once
 * the bot is observed standing on it. That is what makes the controller
 * self-correcting: the engine may refuse a move, because the bot is still on cooldown
 * after harvesting or another bot took the tile, and since nothing was consumed
 * optimistically the same move is simply re-issued next tick.
 *
 * An earlier version consumed a direction per tick regardless of whether the move
 * landed. It desynchronised from reality on the first refused move, and the resulting
 * detours were large enough to make two provably optimal planners report different
 * total path costs for the same scenario.
 *
 * Re-planning happens when the target changes, when the route is exhausted, or when
 * the bot is no longer adjacent to its next waypoint. Re-planning every tick would be
 * simpler and would make the expansion counts meaningless, because the interesting
 * number is what it cost to produce a route, not how often one was recomputed.
 */
export function createPlanningController(
  plannerId: Exclude<PlannerId, 'reflex'>,
  objective: Objective,
): Controller {
  const planner = plannerById(plannerId);
  let waypoints: Position[] = [];
  let routeTarget: Position | null = null;
  let lastPlan: PlanTelemetry | null = null;
  const visited = new Set<string>();

  return {
    get lastPlan() {
      return lastPlan;
    },
    decide(state, botId): Intent {
      const bot = botOf(state, botId);
      if (bot === undefined) return { kind: 'wait', bot: botId };
      visited.add(positionKey(bot.position));

      const target = chooseTarget(state, bot.position, bot.carrying !== null, objective, visited);
      if (target === null) return { kind: 'wait', bot: botId };

      if (samePosition(bot.position, target.position)) {
        waypoints = [];
        routeTarget = null;
        return actOnArrival(target.action, botId);
      }

      // Drop any waypoints already underfoot. Normally at most one per tick; more
      // only if something moved the bot without this controller's involvement.
      while (waypoints.length > 0) {
        const head = waypoints[0];
        if (head === undefined || !samePosition(head, bot.position)) break;
        waypoints.shift();
      }

      const targetChanged = routeTarget === null || !samePosition(routeTarget, target.position);
      const head = waypoints[0];
      const offRoute = head !== undefined && directionBetween(bot.position, head) === null;

      if (targetChanged || waypoints.length === 0 || offRoute) {
        const plan =
          objective.kind === 'survey'
            ? planSurvey(state, bot.position, target.position, planner, visited)
            : planRoute(state, bot.position, target.position, planner);
        // `route` starts at the bot's own tile; the waypoints are what comes after.
        waypoints = [...plan.route.slice(1)];
        routeTarget = target.position;
        lastPlan = plan;
      }

      const next = waypoints[0];
      if (next === undefined) return { kind: 'wait', bot: botId };
      const direction = directionBetween(bot.position, next);
      if (direction === null) {
        // The plan cannot be followed from here; drop it and re-plan next tick.
        waypoints = [];
        routeTarget = null;
        return { kind: 'wait', bot: botId };
      }
      return { kind: 'move', bot: botId, direction };
    },
  };
}

function toDirections(route: readonly Position[]): readonly Direction[] {
  const directions: Direction[] = [];
  for (let index = 1; index < route.length; index++) {
    const previous = route[index - 1];
    const current = route[index];
    if (previous === undefined || current === undefined) continue;
    const direction = directionBetween(previous, current);
    if (direction !== null) directions.push(direction);
  }
  return directions;
}

function planRoute(
  state: WorldState,
  from: Position,
  to: Position,
  planner: ReturnType<typeof plannerById>,
): PlanTelemetry {
  const explored: Position[] = [];
  const outcome = planner.solve(routingProblem(state.grid, from, to), routingHeuristic(to), {
    onExpand: (position) => explored.push(position),
  });
  return {
    planner: planner.id,
    from,
    to,
    found: outcome.found,
    cost: outcome.found ? outcome.cost : 0,
    steps: outcome.found ? outcome.path.length : 0,
    stats: outcome.stats,
    route: outcome.found ? outcome.states : [],
    directions: outcome.found ? outcome.path : [],
    explored,
  };
}

/**
 * Plans a whole survey tour, then hands back only the leg to the next site.
 *
 * The tour is genuinely multi-goal, with the state being `(position, visited-set)`,
 * but the bot still moves one tile at a time, so the route is cut at the first
 * unvisited site it reaches and re-solved from there. Re-solving is wasteful on purpose: it keeps
 * each plan's reported cost honest about the work that produced it.
 */
function planSurvey(
  state: WorldState,
  from: Position,
  fallback: Position,
  planner: ReturnType<typeof plannerById>,
  visited: ReadonlySet<string>,
): PlanTelemetry {
  const home = nearestDepot(state, from) ?? fallback;
  const sites = surveySites(state).filter((site) => !visited.has(positionKey(site)));
  if (sites.length === 0) return planRoute(state, from, home, planner);

  const explored: Position[] = [];
  const outcome = planner.solve(
    surveyProblem(state.grid, from, sites, home),
    surveyHeuristic(sites, home),
    { onExpand: (surveyState) => explored.push(surveyState.position) },
  );
  if (!outcome.found) {
    return {
      planner: planner.id,
      from,
      to: fallback,
      found: false,
      cost: 0,
      steps: 0,
      stats: outcome.stats,
      route: [],
      directions: [],
      explored,
    };
  }

  const positions = outcome.states.map((surveyState) => surveyState.position);
  let cut = positions.length - 1;
  for (let index = 1; index < positions.length; index++) {
    const position = positions[index];
    if (position !== undefined && sites.some((site) => samePosition(site, position))) {
      cut = index;
      break;
    }
  }
  const leg = positions.slice(0, cut + 1);

  return {
    planner: planner.id,
    from,
    to: leg.at(-1) ?? fallback,
    found: true,
    cost: outcome.cost,
    steps: outcome.path.length,
    stats: outcome.stats,
    route: leg,
    directions: toDirections(leg),
    explored,
  };
}

/** Builds the controller for a planner id, including the search-free reflex agent. */
export function createController(plannerId: PlannerId, objective: Objective): Controller {
  return plannerId === 'reflex'
    ? createReflexController(objective)
    : createPlanningController(plannerId, objective);
}
