import type { Direction, Position } from '@rationauts/core';
import type { SearchStats } from '@rationauts/agents';

/**
 * What the last planning call did.
 *
 * Carried out of the controller so the client can draw it and the benchmark can
 * total it. `expanded` is the number that makes the `great-plain` scenario legible:
 * A\* and uniform-cost search return paths of identical cost, and the only visible
 * difference between them is how much of the map each one had to look at.
 */
export interface PlanTelemetry {
  readonly planner: string;
  readonly from: Position;
  readonly to: Position;
  readonly found: boolean;
  readonly cost: number;
  readonly steps: number;
  readonly stats: SearchStats;
  /** Tiles along the planned route, for the client's overlay. */
  readonly route: readonly Position[];
  readonly directions: readonly Direction[];
}

export const EMPTY_STATS: SearchStats = { expanded: 0, generated: 0, maxFrontier: 0 };
