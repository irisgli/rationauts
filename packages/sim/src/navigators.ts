import {
  aStarSearch,
  breadthFirstSearch,
  depthFirstSearch,
  greedyBestFirstSearch,
  uniformCostSearch,
  type Heuristic,
  type SearchOutcome,
  type SearchProblem,
} from '@rationauts/agents';

/**
 * The installable modules — the game's tech tree, expressed as code.
 *
 * A planner is the thing a player fits to a bot. Uninformed planners ignore the
 * heuristic they are handed; keeping the signature uniform means the controller does
 * not branch on which module is installed, and swapping one for another at runtime is
 * a single assignment.
 */
export interface Planner {
  readonly id: PlannerId;
  readonly label: string;
  /** One line, written for a player rather than for a reviewer. */
  readonly blurb: string;
  /** True when the planner returns a least-cost path on any non-negative costs. */
  readonly optimal: boolean;
  solve<S, A>(problem: SearchProblem<S, A>, heuristic: Heuristic<S>): SearchOutcome<S, A>;
}

export const PLANNER_IDS = ['reflex', 'dfs', 'bfs', 'ucs', 'greedy', 'astar'] as const;

export type PlannerId = (typeof PLANNER_IDS)[number];

/**
 * Search-based planners. `reflex` is absent on purpose: it does no search at all, and
 * pretending otherwise would mean inventing a `SearchOutcome` it never computed.
 */
export const PLANNERS: Readonly<Record<Exclude<PlannerId, 'reflex'>, Planner>> = {
  dfs: {
    id: 'dfs',
    label: 'Depth-first',
    blurb: 'Commits to a direction and follows it. Arrives eventually, rarely sensibly.',
    optimal: false,
    solve: (problem) => depthFirstSearch(problem),
  },
  bfs: {
    id: 'bfs',
    label: 'Breadth-first',
    blurb: 'Finds the route with the fewest steps. Has no idea what a step costs.',
    optimal: false,
    solve: (problem) => breadthFirstSearch(problem),
  },
  ucs: {
    id: 'ucs',
    label: 'Uniform-cost',
    blurb: 'Finds the cheapest route. Looks everywhere to be sure of it.',
    optimal: true,
    solve: (problem) => uniformCostSearch(problem),
  },
  greedy: {
    id: 'greedy',
    label: 'Greedy best-first',
    blurb: 'Runs at the goal and hopes. Fast, and sometimes badly wrong.',
    optimal: false,
    solve: (problem, heuristic) => greedyBestFirstSearch(problem, heuristic),
  },
  astar: {
    id: 'astar',
    label: 'A*',
    blurb: 'The cheapest route, without looking everywhere for it.',
    optimal: true,
    solve: (problem, heuristic) => aStarSearch(problem, heuristic),
  },
};

export function plannerById(id: Exclude<PlannerId, 'reflex'>): Planner {
  return PLANNERS[id];
}

export function isPlannerId(value: string): value is PlannerId {
  return (PLANNER_IDS as readonly string[]).includes(value);
}
