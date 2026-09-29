import { DIRECTIONS, translate, type Position } from './geometry.js';
import { isPassable, movementCost, TERRAIN_SYMBOLS, type Terrain } from './terrain.js';

/**
 * An immutable rectangular tile map.
 *
 * Tiles are held in a flat row-major array rather than a 2-D array: it keeps the
 * structure cheap to copy, trivially serialisable for replays, and cache-friendly
 * for the inner loops of search, which walk it constantly.
 */
export interface Grid {
  readonly width: number;
  readonly height: number;
  readonly tiles: readonly Terrain[];
}

export function createGrid(width: number, height: number, tiles: readonly Terrain[]): Grid {
  if (width <= 0 || height <= 0 || !Number.isInteger(width) || !Number.isInteger(height)) {
    throw new RangeError(
      `Grid dimensions must be positive integers, received ${String(width)}x${String(height)}`,
    );
  }
  if (tiles.length !== width * height) {
    throw new RangeError(
      `Expected ${String(width * height)} tiles for a ${String(width)}x${String(height)} grid, received ${String(tiles.length)}`,
    );
  }
  return { width, height, tiles };
}

export function inBounds(grid: Grid, position: Position): boolean {
  return (
    Number.isInteger(position.x) &&
    Number.isInteger(position.y) &&
    position.x >= 0 &&
    position.y >= 0 &&
    position.x < grid.width &&
    position.y < grid.height
  );
}

/** Returns the terrain at `position`, or `undefined` if it lies outside the grid. */
export function tileAt(grid: Grid, position: Position): Terrain | undefined {
  if (!inBounds(grid, position)) return undefined;
  return grid.tiles[position.y * grid.width + position.x];
}

/** True when `position` is inside the grid and its terrain can be entered. */
export function isWalkable(grid: Grid, position: Position): boolean {
  const terrain = tileAt(grid, position);
  return terrain !== undefined && isPassable(terrain);
}

/**
 * Cost of entering `position`, or `Infinity` when it is out of bounds or blocked.
 *
 * Returning `Infinity` rather than throwing lets search code stay branch-light: an
 * unreachable successor simply never wins a priority-queue comparison.
 */
export function enterCost(grid: Grid, position: Position): number {
  const terrain = tileAt(grid, position);
  if (terrain === undefined) return Number.POSITIVE_INFINITY;
  return movementCost(terrain);
}

/**
 * Walkable four-way neighbours of `position`, in {@link DIRECTIONS} order.
 *
 * The fixed order is what makes tie-breaking between equal-cost optimal paths
 * deterministic, which in turn is what lets golden-file tests assert on an exact
 * path rather than merely on its cost.
 */
export function walkableNeighbours(grid: Grid, position: Position): readonly Position[] {
  const result: Position[] = [];
  for (const direction of DIRECTIONS) {
    const candidate = translate(position, direction);
    if (isWalkable(grid, candidate)) result.push(candidate);
  }
  return result;
}

/** Every position in the grid, in row-major order. */
export function allPositions(grid: Grid): readonly Position[] {
  const result: Position[] = [];
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) result.push({ x, y });
  }
  return result;
}

/** The result of parsing an ASCII map: terrain plus the positions of any markers. */
export interface ParsedMap {
  readonly grid: Grid;
  /** Non-terrain symbols found in the map, keyed by symbol, in row-major order. */
  readonly markers: ReadonlyMap<string, readonly Position[]>;
}

/**
 * Parses an ASCII map into a grid and a set of marker positions.
 *
 * Terrain symbols are defined by {@link TERRAIN_SYMBOLS}. Any other non-space
 * character is recorded as a marker sitting on plains, which is how scenarios
 * place bots, depots and resource nodes without the engine needing to know what
 * those letters mean. Leading and trailing blank lines are ignored so that maps
 * can be written as readable template literals.
 *
 * @throws SyntaxError when rows have inconsistent widths or the map is empty.
 */
export function parseMap(ascii: string): ParsedMap {
  const rows = ascii.split('\n').filter((row) => row.trim().length > 0);
  if (rows.length === 0) throw new SyntaxError('Map is empty');

  const width = Math.max(...rows.map((row) => row.length));
  const tiles: Terrain[] = [];
  const markers = new Map<string, Position[]>();

  for (let y = 0; y < rows.length; y++) {
    const row = rows[y] ?? '';
    if (row.trim().length !== 0 && row.length !== width) {
      // Right-padding is allowed (trailing spaces are invisible in source files),
      // but a genuinely ragged map is far more likely to be a typo than intent.
      if (row.trimEnd().length > width) {
        throw new SyntaxError(
          `Row ${String(y)} has width ${String(row.length)}, expected at most ${String(width)}`,
        );
      }
    }
    for (let x = 0; x < width; x++) {
      const symbol = row[x] ?? ' ';
      const terrain = TERRAIN_SYMBOLS[symbol];
      if (terrain !== undefined) {
        tiles.push(terrain);
        continue;
      }
      if (symbol !== ' ') {
        const existing = markers.get(symbol) ?? [];
        existing.push({ x, y });
        markers.set(symbol, existing);
      }
      // Unknown symbols and padding both resolve to plains underneath.
      tiles.push('plains');
    }
  }

  return {
    grid: createGrid(width, rows.length, tiles),
    markers: new Map([...markers].map(([symbol, positions]) => [symbol, positions])),
  };
}
