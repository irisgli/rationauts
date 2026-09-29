/** Integer grid coordinates and the four-way movement model shared by the engine. */

/** A position on the tile grid. Coordinates are integers; `y` grows downward. */
export interface Position {
  readonly x: number;
  readonly y: number;
}

/** The four cardinal directions. Rationauts uses four-way movement everywhere. */
export const Direction = {
  North: 'north',
  East: 'east',
  South: 'south',
  West: 'west',
} as const;

export type Direction = (typeof Direction)[keyof typeof Direction];

/**
 * Directions in a fixed iteration order.
 *
 * The order is load-bearing: search algorithms expand successors in this order, so
 * changing it changes which of several equal-cost optimal paths is returned. Tests
 * depend on that being stable.
 */
export const DIRECTIONS: readonly Direction[] = [
  Direction.North,
  Direction.East,
  Direction.South,
  Direction.West,
];

const DELTAS: Record<Direction, Position> = {
  [Direction.North]: { x: 0, y: -1 },
  [Direction.East]: { x: 1, y: 0 },
  [Direction.South]: { x: 0, y: 1 },
  [Direction.West]: { x: -1, y: 0 },
};

/** Returns the position one step from `from` in `direction`. */
export function translate(from: Position, direction: Direction): Position {
  const delta = DELTAS[direction];
  return { x: from.x + delta.x, y: from.y + delta.y };
}

/** Returns the direction from `from` to an orthogonally adjacent `to`, or null. */
export function directionBetween(from: Position, to: Position): Direction | null {
  for (const direction of DIRECTIONS) {
    const candidate = translate(from, direction);
    if (candidate.x === to.x && candidate.y === to.y) return direction;
  }
  return null;
}

/** Structural equality for positions. */
export function samePosition(a: Position, b: Position): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Manhattan (L1) distance.
 *
 * This is the canonical admissible heuristic for four-way movement on a grid whose
 * minimum step cost is 1: it never overestimates, because any path must make at
 * least `|dx| + |dy|` moves and each costs at least 1.
 */
export function manhattan(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/** Chebyshev (L-infinity) distance. Not admissible for four-way movement. */
export function chebyshev(a: Position, b: Position): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** A canonical string key for use in `Map`/`Set`, since `Position` is structural. */
export function positionKey(position: Position): string {
  return `${String(position.x)},${String(position.y)}`;
}
