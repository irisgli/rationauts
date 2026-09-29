import type { SearchProblem } from '../problem.js';

/**
 * The eight-puzzle, as a search problem with a state type that is nothing like a grid
 * position.
 *
 * Its job here is to hold the algorithm library honest. A pathfinder that secretly
 * assumes its states are `{x, y}` cells will compile against `SearchProblem` and then
 * fail on this, which is exactly the kind of coupling ADR 4 exists to prevent. It also
 * has a well-known optimal solution length for any given instance, so it provides
 * ground truth that was not produced by this codebase.
 */

/** A board as nine characters in row-major order; `0` is the blank. */
export type Board = string;

export type Slide = 'up' | 'down' | 'left' | 'right';

export const SOLVED: Board = '123456780';

const SLIDES: readonly Slide[] = ['up', 'down', 'left', 'right'];

const OFFSET: Record<Slide, number> = { up: -3, down: 3, left: -1, right: 1 };

function blankIndex(board: Board): number {
  return board.indexOf('0');
}

function canSlide(board: Board, slide: Slide): boolean {
  const blank = blankIndex(board);
  const column = blank % 3;
  switch (slide) {
    case 'up':
      return blank >= 3;
    case 'down':
      return blank < 6;
    case 'left':
      return column > 0;
    case 'right':
      return column < 2;
  }
}

/** Returns `board` with the character at `index` replaced. */
function withTileAt(board: Board, index: number, tile: string): Board {
  return board.slice(0, index) + tile + board.slice(index + 1);
}

function applySlide(board: Board, slide: Slide): Board {
  const blank = blankIndex(board);
  const target = blank + OFFSET[slide];
  const moved = board[target];
  if (moved === undefined) return board;
  return withTileAt(withTileAt(board, blank, moved), target, '0');
}

/** The eight-puzzle as a unit-cost search problem. */
export function eightPuzzle(initial: Board, goal: Board = SOLVED): SearchProblem<Board, Slide> {
  return {
    initial,
    isGoal: (board) => board === goal,
    actions: (board) => SLIDES.filter((slide) => canSlide(board, slide)),
    result: applySlide,
    stepCost: () => 1,
    // The state is already a canonical string, so it is its own key.
    key: (board) => board,
  };
}

/**
 * Sum of Manhattan distances of each tile from its goal position.
 *
 * Admissible: every misplaced tile must move at least that far, and each move
 * relocates exactly one tile by exactly one square.
 */
export function manhattanHeuristic(goal: Board = SOLVED): (board: Board) => number {
  const goalIndex = new Map<string, number>();
  for (let index = 0; index < goal.length; index++) {
    const tile = goal[index];
    if (tile !== undefined) goalIndex.set(tile, index);
  }

  return (board: Board): number => {
    let total = 0;
    for (let index = 0; index < board.length; index++) {
      const tile = board[index];
      if (tile === undefined || tile === '0') continue;
      const target = goalIndex.get(tile);
      if (target === undefined) continue;
      total +=
        Math.abs(Math.floor(index / 3) - Math.floor(target / 3)) +
        Math.abs((index % 3) - (target % 3));
    }
    return total;
  };
}

/** Number of tiles not in their goal position. Admissible, and weaker than Manhattan. */
export function misplacedTiles(goal: Board = SOLVED): (board: Board) => number {
  return (board: Board): number => {
    let total = 0;
    for (let index = 0; index < board.length; index++) {
      const tile = board[index];
      if (tile === undefined || tile === '0') continue;
      if (tile !== goal[index]) total++;
    }
    return total;
  };
}

/** Produces a solvable board by sliding the blank randomly from the solved state. */
export function scramble(random: () => number, moves: number, goal: Board = SOLVED): Board {
  let board = goal;
  for (let i = 0; i < moves; i++) {
    const legal = SLIDES.filter((slide) => canSlide(board, slide));
    const choice = legal[Math.floor(random() * legal.length)];
    if (choice === undefined) continue;
    board = applySlide(board, choice);
  }
  return board;
}
