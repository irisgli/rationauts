import { describe, expect, it } from 'vitest';
import {
  allPositions,
  createGrid,
  enterCost,
  parseMap,
  tileAt,
  walkableNeighbours,
} from './grid.js';
import { Terrain } from './terrain.js';

describe('createGrid', () => {
  it('rejects dimensions that do not match the tile count', () => {
    expect(() => createGrid(2, 2, [Terrain.Plains])).toThrow(RangeError);
  });

  it('rejects non-positive dimensions', () => {
    expect(() => createGrid(0, 1, [])).toThrow(RangeError);
  });
});

describe('parseMap', () => {
  const ascii = `
....#
.,,.#
.^..~
`;

  it('reads terrain symbols in row-major order', () => {
    const { grid } = parseMap(ascii);
    expect(grid.width).toBe(5);
    expect(grid.height).toBe(3);
    expect(tileAt(grid, { x: 4, y: 0 })).toBe(Terrain.Rock);
    expect(tileAt(grid, { x: 1, y: 1 })).toBe(Terrain.Mud);
    expect(tileAt(grid, { x: 1, y: 2 })).toBe(Terrain.Forest);
    expect(tileAt(grid, { x: 4, y: 2 })).toBe(Terrain.Water);
  });

  it('records non-terrain symbols as markers over plains', () => {
    const { grid, markers } = parseMap('.B.\n.D.');
    expect(markers.get('B')).toEqual([{ x: 1, y: 0 }]);
    expect(markers.get('D')).toEqual([{ x: 1, y: 1 }]);
    expect(tileAt(grid, { x: 1, y: 0 })).toBe(Terrain.Plains);
  });

  it('collects repeated markers in row-major order', () => {
    const { markers } = parseMap('T.T\n..T');
    expect(markers.get('T')).toEqual([
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ]);
  });

  it('rejects an empty map', () => {
    expect(() => parseMap('   \n\n')).toThrow(SyntaxError);
  });
});

describe('tileAt', () => {
  it('returns undefined outside the grid', () => {
    const { grid } = parseMap('..\n..');
    expect(tileAt(grid, { x: -1, y: 0 })).toBeUndefined();
    expect(tileAt(grid, { x: 0, y: 2 })).toBeUndefined();
    expect(tileAt(grid, { x: 0.5, y: 0 })).toBeUndefined();
  });
});

describe('enterCost', () => {
  it('is infinite off-grid and on blocked terrain', () => {
    const { grid } = parseMap('.#');
    expect(enterCost(grid, { x: 1, y: 0 })).toBe(Number.POSITIVE_INFINITY);
    expect(enterCost(grid, { x: 9, y: 9 })).toBe(Number.POSITIVE_INFINITY);
  });

  it('reflects the terrain cost table', () => {
    const { grid } = parseMap('.,^');
    expect(enterCost(grid, { x: 0, y: 0 })).toBe(1);
    expect(enterCost(grid, { x: 1, y: 0 })).toBe(8);
    expect(enterCost(grid, { x: 2, y: 0 })).toBe(3);
  });
});

describe('walkableNeighbours', () => {
  it('returns neighbours in north, east, south, west order', () => {
    const { grid } = parseMap('...\n...\n...');
    expect(walkableNeighbours(grid, { x: 1, y: 1 })).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 0, y: 1 },
    ]);
  });

  it('omits blocked and out-of-bounds neighbours', () => {
    const { grid } = parseMap('.#\n..');
    expect(walkableNeighbours(grid, { x: 0, y: 0 })).toEqual([{ x: 0, y: 1 }]);
  });
});

describe('allPositions', () => {
  it('enumerates the grid in row-major order', () => {
    const { grid } = parseMap('..\n..');
    expect(allPositions(grid)).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ]);
  });
});
