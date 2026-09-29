/**
 * Terrain types and their movement costs.
 *
 * The cost table is the single most important tuning surface in the game, because
 * it is what separates one search algorithm from the next. If every passable tile
 * cost the same, breadth-first search would already be optimal and there would be
 * nothing to teach. The spread below is deliberately wide: crossing a mud tile
 * costs as much as eight plains tiles, so a breadth-first route that "looks"
 * shorter on screen is dramatically worse in practice.
 */

export const Terrain = {
  /** Open ground. The cheapest passable tile. */
  Plains: 'plains',
  /** Passable but slow. Creates genuine cost/length trade-offs. */
  Forest: 'forest',
  /** Passable and punishing. This is what makes uniform-cost search worth it. */
  Mud: 'mud',
  /** Impassable. */
  Rock: 'rock',
  /** Impassable. */
  Water: 'water',
} as const;

export type Terrain = (typeof Terrain)[keyof typeof Terrain];

/**
 * Cost in simulation ticks of entering a tile of each terrain type.
 *
 * Impassable terrain is represented by `Infinity` rather than a sentinel so that
 * arithmetic over path costs stays total: an impassable route simply costs
 * infinity and loses every comparison.
 */
export const TERRAIN_COST: Readonly<Record<Terrain, number>> = {
  [Terrain.Plains]: 1,
  [Terrain.Forest]: 3,
  [Terrain.Mud]: 8,
  [Terrain.Rock]: Number.POSITIVE_INFINITY,
  [Terrain.Water]: Number.POSITIVE_INFINITY,
};

/**
 * The cheapest possible cost of any single step.
 *
 * Heuristics are scaled by this value to stay admissible: a heuristic that counts
 * remaining *steps* must be multiplied by the minimum *cost per step* before it can
 * be compared against a path cost.
 */
export const MIN_STEP_COST: number = Math.min(
  ...Object.values(TERRAIN_COST).filter((cost) => Number.isFinite(cost)),
);

export function isPassable(terrain: Terrain): boolean {
  return Number.isFinite(TERRAIN_COST[terrain]);
}

export function movementCost(terrain: Terrain): number {
  return TERRAIN_COST[terrain];
}

/** Single-character map symbols, used by the ASCII scenario format. */
export const TERRAIN_SYMBOLS: Readonly<Record<string, Terrain>> = {
  '.': Terrain.Plains,
  '^': Terrain.Forest,
  ',': Terrain.Mud,
  '#': Terrain.Rock,
  '~': Terrain.Water,
};
