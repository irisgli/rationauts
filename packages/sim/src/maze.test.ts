import { uniformCostSearch } from '@rationauts/agents';
import { isWalkable, Terrain, tileAt } from '@rationauts/core';
import { describe, expect, it } from 'vitest';
import { generateMaze } from './maze.js';
import { routingProblem } from './problems.js';

describe('generateMaze', () => {
  it('is reproducible for a given seed', () => {
    expect(generateMaze(42, 8)).toEqual(generateMaze(42, 8));
  });

  it('produces different mazes for different seeds', () => {
    expect(generateMaze(1, 8).grid.tiles).not.toEqual(generateMaze(2, 8).grid.tiles);
  });

  it('has an odd side length and a solid border', () => {
    const { grid } = generateMaze(7, 6);
    expect(grid.width).toBe(13);
    expect(grid.height).toBe(13);
    for (let x = 0; x < grid.width; x++) {
      expect(tileAt(grid, { x, y: 0 })).toBe(Terrain.Rock);
      expect(tileAt(grid, { x, y: grid.height - 1 })).toBe(Terrain.Rock);
    }
  });

  it('always leaves the goal reachable from the start', () => {
    for (const seed of [1, 2, 3, 17, 99, 12345]) {
      const { grid, start, goal } = generateMaze(seed, 10);
      expect(isWalkable(grid, start)).toBe(true);
      expect(isWalkable(grid, goal)).toBe(true);
      expect(
        uniformCostSearch(routingProblem(grid, start, goal)).found,
        `seed ${String(seed)}`,
      ).toBe(true);
    }
  });

  it('braiding adds routes without ever opening the border', () => {
    const perfect = generateMaze(5, 10, 0);
    const braided = generateMaze(5, 10, 0.4);
    const openTiles = (grid: typeof perfect.grid): number =>
      grid.tiles.filter((tile) => tile !== Terrain.Rock).length;
    expect(openTiles(braided.grid)).toBeGreaterThan(openTiles(perfect.grid));

    for (let x = 0; x < braided.grid.width; x++) {
      expect(tileAt(braided.grid, { x, y: 0 })).toBe(Terrain.Rock);
    }
    for (let y = 0; y < braided.grid.height; y++) {
      expect(tileAt(braided.grid, { x: 0, y })).toBe(Terrain.Rock);
    }
  });

  it('rejects a maze too small to carve', () => {
    expect(() => generateMaze(1, 1)).toThrow(RangeError);
    expect(() => generateMaze(1, 2.5)).toThrow(RangeError);
  });
});
