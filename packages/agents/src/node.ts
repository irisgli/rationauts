import type { SearchProblem } from './problem.js';

/**
 * A node in the search tree.
 *
 * Nodes hold a parent pointer rather than a full path. Paths are reconstructed once,
 * on success, which keeps the frontier cheap: with a copied path per node, breadth-first
 * search on a large grid spends most of its memory on array copies of shared prefixes.
 */
export interface SearchNode<S, A> {
  readonly state: S;
  readonly parent: SearchNode<S, A> | null;
  /** The action taken in the parent to reach this state; null at the root. */
  readonly action: A | null;
  /** Path cost from the initial state, conventionally written g(n). */
  readonly cost: number;
  /** Number of actions from the initial state. */
  readonly depth: number;
}

export function rootNode<S, A>(state: S): SearchNode<S, A> {
  return { state, parent: null, action: null, cost: 0, depth: 0 };
}

export function childNode<S, A>(
  problem: SearchProblem<S, A>,
  parent: SearchNode<S, A>,
  action: A,
): SearchNode<S, A> {
  const state = problem.result(parent.state, action);
  return {
    state,
    parent,
    action,
    cost: parent.cost + problem.stepCost(parent.state, action, state),
    depth: parent.depth + 1,
  };
}

/** Walks parent pointers back to the root, returning the path in forward order. */
export function reconstruct<S, A>(
  node: SearchNode<S, A>,
): {
  path: readonly A[];
  states: readonly S[];
} {
  const path: A[] = [];
  const states: S[] = [];
  let current: SearchNode<S, A> | null = node;
  while (current !== null) {
    states.push(current.state);
    if (current.action !== null) path.push(current.action);
    current = current.parent;
  }
  path.reverse();
  states.reverse();
  return { path, states };
}
