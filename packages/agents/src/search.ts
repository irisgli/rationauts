import { childNode, reconstruct, rootNode, type SearchNode } from './node.js';
import { PriorityQueue } from './priority-queue.js';
import {
  DEFAULT_MAX_EXPANSIONS,
  type Heuristic,
  type SearchOptions,
  type SearchOutcome,
  type SearchProblem,
  type SearchStats,
} from './problem.js';

/**
 * Classical search algorithms over {@link SearchProblem}.
 *
 * Every algorithm here is a *graph* search: it keeps a record of states already seen
 * so that it never re-explores one. On a grid this is not an optimisation but a
 * correctness requirement: the state space is cyclic, and tree search would not
 * terminate.
 *
 * All four test for the goal when a node is **expanded**, not when it is generated.
 * Testing on generation is a common and legitimate optimisation for breadth-first
 * search, but it makes `expanded` counts incomparable between algorithms, and
 * comparing expansion counts is the entire point of the `great-plain` scenario.
 * Uniformity is worth more here than the constant factor.
 */

interface Counters {
  expanded: number;
  generated: number;
  maxFrontier: number;
}

function snapshot(counters: Counters): SearchStats {
  return {
    expanded: counters.expanded,
    generated: counters.generated,
    maxFrontier: counters.maxFrontier,
  };
}

function succeed<S, A>(node: SearchNode<S, A>, counters: Counters): SearchOutcome<S, A> {
  const { path, states } = reconstruct(node);
  return { found: true, path, states, cost: node.cost, stats: snapshot(counters) };
}

/**
 * Breadth-first search. Optimal in the number of actions, not in cost.
 *
 * This is the module that makes `mudflats` teach something: BFS finds the route with
 * the fewest steps, which on a map with an eight-cost mud flat is emphatically not the
 * route that takes the least time.
 */
export function breadthFirstSearch<S, A>(
  problem: SearchProblem<S, A>,
  options: SearchOptions<S> = {},
): SearchOutcome<S, A> {
  const limit = options.maxExpansions ?? DEFAULT_MAX_EXPANSIONS;
  const counters: Counters = { expanded: 0, generated: 0, maxFrontier: 1 };

  const frontier: SearchNode<S, A>[] = [rootNode(problem.initial)];
  let head = 0; // Index-based dequeue; Array.shift is O(n) and this loop is hot.
  const seen = new Set<string>([problem.key(problem.initial)]);

  while (head < frontier.length) {
    const node = frontier[head++];
    if (node === undefined) break;

    if (problem.isGoal(node.state)) return succeed(node, counters);

    counters.expanded++;
    options.onExpand?.(node.state, counters.expanded);
    if (counters.expanded > limit) {
      return { found: false, reason: 'limit-reached', stats: snapshot(counters) };
    }

    for (const action of problem.actions(node.state)) {
      const child = childNode(problem, node, action);
      counters.generated++;
      const key = problem.key(child.state);
      if (seen.has(key)) continue;
      seen.add(key);
      frontier.push(child);
    }
    counters.maxFrontier = Math.max(counters.maxFrontier, frontier.length - head);
  }

  return { found: false, reason: 'exhausted', stats: snapshot(counters) };
}

/**
 * Depth-first search. Complete on a finite graph, optimal in nothing.
 *
 * Included because it is the cheapest way to show what optimality buys: on
 * `wall-gap` it returns a path several times longer than necessary while expanding
 * fewer states, which is exactly the trade a player should be able to see.
 */
export function depthFirstSearch<S, A>(
  problem: SearchProblem<S, A>,
  options: SearchOptions<S> = {},
): SearchOutcome<S, A> {
  const limit = options.maxExpansions ?? DEFAULT_MAX_EXPANSIONS;
  const counters: Counters = { expanded: 0, generated: 0, maxFrontier: 1 };

  const frontier: SearchNode<S, A>[] = [rootNode(problem.initial)];
  const seen = new Set<string>();

  while (frontier.length > 0) {
    const node = frontier.pop();
    if (node === undefined) break;

    const key = problem.key(node.state);
    if (seen.has(key)) continue;
    seen.add(key);

    if (problem.isGoal(node.state)) return succeed(node, counters);

    counters.expanded++;
    options.onExpand?.(node.state, counters.expanded);
    if (counters.expanded > limit) {
      return { found: false, reason: 'limit-reached', stats: snapshot(counters) };
    }

    const actions = problem.actions(node.state);
    // Pushed in reverse so the stack pops them in the problem's declared order,
    // which keeps the explored branch identical to a recursive formulation.
    for (let i = actions.length - 1; i >= 0; i--) {
      const action = actions[i];
      if (action === undefined) continue;
      const child = childNode(problem, node, action);
      counters.generated++;
      if (!seen.has(problem.key(child.state))) frontier.push(child);
    }
    counters.maxFrontier = Math.max(counters.maxFrontier, frontier.length);
  }

  return { found: false, reason: 'exhausted', stats: snapshot(counters) };
}

/**
 * Best-first search on f(n) = g(n) + h(n).
 *
 * The shared engine behind uniform-cost search (h = 0), greedy search (g ignored) and
 * A\*. Keeping them as one implementation makes the relationship between them the
 * obvious thing about the code rather than a comment.
 *
 * A node is re-opened when a cheaper route to an already-reached state is found. With
 * a consistent heuristic that never happens, but admissible-yet-inconsistent
 * heuristics are easy to write by accident, and silently returning a suboptimal path
 * in that case would be a poor way to teach what admissibility means.
 */
function bestFirstSearch<S, A>(
  problem: SearchProblem<S, A>,
  evaluate: (node: SearchNode<S, A>) => number,
  options: SearchOptions<S> = {},
): SearchOutcome<S, A> {
  const limit = options.maxExpansions ?? DEFAULT_MAX_EXPANSIONS;
  const counters: Counters = { expanded: 0, generated: 0, maxFrontier: 1 };

  const start = rootNode<S, A>(problem.initial);
  const frontier = new PriorityQueue<SearchNode<S, A>>();
  frontier.push(start, evaluate(start));

  const bestCost = new Map<string, number>([[problem.key(problem.initial), 0]]);

  while (!frontier.isEmpty) {
    const node = frontier.pop();
    if (node === undefined) break;

    const key = problem.key(node.state);
    const known = bestCost.get(key);
    // A stale duplicate: a cheaper route to this state was queued after this entry.
    if (known !== undefined && node.cost > known) continue;

    if (problem.isGoal(node.state)) return succeed(node, counters);

    counters.expanded++;
    options.onExpand?.(node.state, counters.expanded);
    if (counters.expanded > limit) {
      return { found: false, reason: 'limit-reached', stats: snapshot(counters) };
    }

    for (const action of problem.actions(node.state)) {
      const child = childNode(problem, node, action);
      counters.generated++;
      const childKey = problem.key(child.state);
      const previous = bestCost.get(childKey);
      if (previous !== undefined && child.cost >= previous) continue;
      bestCost.set(childKey, child.cost);
      frontier.push(child, evaluate(child));
    }
    counters.maxFrontier = Math.max(counters.maxFrontier, frontier.size);
  }

  return { found: false, reason: 'exhausted', stats: snapshot(counters) };
}

/** Uniform-cost search. Optimal for any non-negative step costs. */
export function uniformCostSearch<S, A>(
  problem: SearchProblem<S, A>,
  options: SearchOptions<S> = {},
): SearchOutcome<S, A> {
  return bestFirstSearch(problem, (node) => node.cost, options);
}

/**
 * A\* search. Optimal when `heuristic` is admissible, meaning it never overestimates
 * the true remaining cost.
 *
 * An inadmissible heuristic does not fail loudly; it quietly returns a suboptimal
 * path. The test suite therefore checks admissibility directly against true
 * cost-to-go computed by exhaustive search on small instances, rather than trusting
 * that a heuristic named `manhattan` is one.
 */
export function aStarSearch<S, A>(
  problem: SearchProblem<S, A>,
  heuristic: Heuristic<S>,
  options: SearchOptions<S> = {},
): SearchOutcome<S, A> {
  return bestFirstSearch(problem, (node) => node.cost + heuristic(node.state), options);
}

/**
 * Greedy best-first search on h(n) alone. Fast, and not optimal.
 *
 * Kept as a first-class export because "expands far fewer states than A\* and
 * sometimes returns a much worse path" is a lesson better delivered by playing than
 * by reading.
 */
export function greedyBestFirstSearch<S, A>(
  problem: SearchProblem<S, A>,
  heuristic: Heuristic<S>,
  options: SearchOptions<S> = {},
): SearchOutcome<S, A> {
  return bestFirstSearch(problem, (node) => heuristic(node.state), options);
}
