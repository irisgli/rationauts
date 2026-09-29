import {
  createGrid,
  makeRng,
  nextInt,
  positionKey,
  shuffle,
  Terrain,
  type Grid,
  type Position,
  type Rng,
} from '@rationauts/core';

/**
 * Seeded procedural maze generation, for benchmarks and adversarial fixtures.
 *
 * Hand-drawn maps are good for teaching a specific lesson and useless for measuring:
 * there are only ever a handful of them, and a planner can be accidentally tuned to
 * the ones that exist. A generator produces cases at any size from a seed, and the
 * seed is all a bug report needs to carry.
 *
 * The algorithm is randomised depth-first carving on a half-resolution lattice, which
 * yields a perfect maze — exactly one route between any two cells. That is the
 * interesting shape for search benchmarks: no shortcuts to stumble into, and a long
 * solution relative to the map size.
 */
export interface GeneratedMaze {
  readonly grid: Grid;
  readonly start: Position;
  readonly goal: Position;
}

/**
 * Carves a maze of `cells` x `cells` rooms into a `2*cells+1` square grid.
 *
 * @param braidChance - probability of knocking out each extra wall afterwards.
 *   Zero leaves a perfect maze; higher values add loops, which makes the map more
 *   forgiving and the search space larger.
 */
export function generateMaze(seed: number, cells: number, braidChance = 0): GeneratedMaze {
  if (!Number.isInteger(cells) || cells < 2) {
    throw new RangeError(`A maze needs at least 2 cells per side, received ${String(cells)}`);
  }

  const size = cells * 2 + 1;
  const tiles: Terrain[] = Array.from({ length: size * size }, () => Terrain.Rock);
  const at = (x: number, y: number): number => y * size + x;
  const carve = (x: number, y: number): void => {
    tiles[at(x, y)] = Terrain.Plains;
  };

  let rng: Rng = makeRng(seed);
  const visited = new Set<string>();
  const stack: Position[] = [{ x: 0, y: 0 }];
  visited.add(positionKey({ x: 0, y: 0 }));
  carve(1, 1);

  while (stack.length > 0) {
    const current = stack.at(-1);
    if (current === undefined) break;

    const candidates = [
      { x: current.x, y: current.y - 1 },
      { x: current.x + 1, y: current.y },
      { x: current.x, y: current.y + 1 },
      { x: current.x - 1, y: current.y },
    ].filter(
      (cell) =>
        cell.x >= 0 &&
        cell.y >= 0 &&
        cell.x < cells &&
        cell.y < cells &&
        !visited.has(positionKey(cell)),
    );

    if (candidates.length === 0) {
      stack.pop();
      continue;
    }

    const [shuffled, nextRng] = shuffle(rng, candidates);
    rng = nextRng;
    const chosen = shuffled[0];
    if (chosen === undefined) {
      stack.pop();
      continue;
    }

    // Knock out the wall between the two rooms, then the room itself.
    carve(current.x + chosen.x + 1, current.y + chosen.y + 1);
    carve(chosen.x * 2 + 1, chosen.y * 2 + 1);
    visited.add(positionKey(chosen));
    stack.push(chosen);
  }

  if (braidChance > 0) {
    for (let y = 1; y < size - 1; y++) {
      for (let x = 1; x < size - 1; x++) {
        if (tiles[at(x, y)] !== Terrain.Rock) continue;
        // Only interior walls with open cells on both sides may be removed, so the
        // outer boundary always survives.
        const horizontal =
          tiles[at(x - 1, y)] !== Terrain.Rock && tiles[at(x + 1, y)] !== Terrain.Rock;
        const vertical =
          tiles[at(x, y - 1)] !== Terrain.Rock && tiles[at(x, y + 1)] !== Terrain.Rock;
        if (!horizontal && !vertical) continue;
        const [roll, advanced] = nextInt(rng, 1000);
        rng = advanced;
        if (roll < braidChance * 1000) carve(x, y);
      }
    }
  }

  return {
    grid: createGrid(size, size, tiles),
    start: { x: 1, y: 1 },
    goal: { x: size - 2, y: size - 2 },
  };
}
