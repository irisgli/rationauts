/**
 * The problem interfaces the algorithm library is written against.
 *
 * Nothing in this package knows about Rationauts. A search algorithm here takes a
 * {@link SearchProblem} and returns a {@link SearchOutcome}; the adapters that express
 * the game's problems in these terms live in `@rationauts/sim`. The payoff is that
 * every algorithm can be validated against problems with independently known answers —
 * the eight-puzzle, or a grid where uniform-cost search provides ground truth — rather
 * than only against the project's own levels.
 *
 * @see docs/adr/0004-algorithms-are-game-agnostic.md
 */

/**
 * A deterministic, fully observable search problem.
 *
 * @typeParam S - the state type. May be any shape; see {@link SearchProblem.key}.
 * @typeParam A - the action type.
 */
export interface SearchProblem<S, A> {
  /** Where search begins. */
  readonly initial: S;

  /** True when `state` satisfies the goal. May match more than one state. */
  isGoal(state: S): boolean;

  /**
   * Actions applicable in `state`.
   *
   * The order is significant: it determines which of several equally good optimal
   * solutions is returned, so implementations must produce a stable order.
   */
  actions(state: S): readonly A[];

  /** The state reached by taking `action` in `state`. Must be deterministic. */
  result(state: S, action: A): S;

  /**
   * The cost of that transition. Must be non-negative.
   *
   * Uniform-cost search and A\* assume non-negative step costs; with negative costs
   * neither is optimal, and neither detects the violation.
   */
  stepCost(state: S, action: A, next: S): number;

  /**
   * A string uniquely identifying `state`, for use as a map key.
   *
   * This exists because JavaScript has neither structural equality nor value types,
   * so `Map` and `Set` compare states by reference. Requiring the problem to supply a
   * key is less invasive than forcing every state to *be* a string, and it keeps the
   * choice of representation with the code that understands the domain.
   *
   * Two states must share a key if and only if they are interchangeable for search.
   */
  key(state: S): string;
}

/** An estimate of the remaining cost from a state to the nearest goal. */
export type Heuristic<S> = (state: S) => number;

/** The trivial heuristic. Turns A\* into uniform-cost search. */
export function zeroHeuristic(): number {
  return 0;
}

/**
 * Work performed during a search.
 *
 * `expanded` is the number that matters when comparing informed against uninformed
 * search: A\* and uniform-cost search return paths of identical cost, and the only
 * visible difference between them is how much of the state space each had to look at.
 */
export interface SearchStats {
  /** States removed from the frontier and expanded. */
  readonly expanded: number;
  /** Successor states generated, including ones immediately discarded. */
  readonly generated: number;
  /** High-water mark of the frontier — a proxy for peak memory. */
  readonly maxFrontier: number;
}

/** Why a search returned without a solution. */
export type SearchFailure =
  /** The reachable state space was exhausted; no goal exists. */
  | 'exhausted'
  /** The expansion budget ran out. A solution may still exist. */
  | 'limit-reached';

/**
 * The result of a search.
 *
 * A discriminated union rather than `Result | null`, so that callers must handle
 * failure explicitly and so that statistics are available either way — a search that
 * found nothing after expanding 40,000 states is exactly the interesting case in a
 * benchmark.
 */
export type SearchOutcome<S, A> =
  | {
      readonly found: true;
      /** Actions leading from the initial state to a goal. */
      readonly path: readonly A[];
      /** States along that path, starting with the initial state. */
      readonly states: readonly S[];
      /** Total cost of the path. */
      readonly cost: number;
      readonly stats: SearchStats;
    }
  | {
      readonly found: false;
      readonly reason: SearchFailure;
      readonly stats: SearchStats;
    };

/** Options common to every search in this package. */
export interface SearchOptions {
  /**
   * Maximum number of expansions before giving up.
   *
   * Present so that a misspecified problem fails loudly and quickly instead of
   * hanging a browser tab. Defaults to 1,000,000.
   */
  readonly maxExpansions?: number;
}

export const DEFAULT_MAX_EXPANSIONS = 1_000_000;
