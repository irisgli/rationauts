# 4. Algorithms are game-agnostic

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

The obvious way to write a pathfinder for a tile game is to write a pathfinder for a
tile game: take a grid and two positions, return a list of positions. It is shorter,
and every line of it is about the problem at hand.

It also makes the implementation untestable against anything but itself. If `aStar`
takes a `Grid`, then the only way to check that it is correct is to run it on grids
this project invented, and the only oracle available is another function in the same
file. Worse, the moment a second search problem appears — "visit all four groves",
which searches over `(position, visited-set)` rather than over positions — the
grid-shaped signature stops fitting and the algorithm has to be rewritten.

## Decision

`@rationauts/agents` depends on nothing, including `@rationauts/core`. Algorithms are
written against small structural interfaces that describe a _problem_, not a world:

```ts
interface SearchProblem<S, A> {
  initial: S;
  isGoal(state: S): boolean;
  actions(state: S): readonly A[];
  result(state: S, action: A): S;
  stepCost(state: S, action: A, next: S): number;
  key(state: S): string;
}
```

The adapters that express Rationauts' own problems in these terms live in
`@rationauts/sim`, which is the layer whose job is binding algorithms to the game.

## Consequences

- Search is validated against problems with independently known answers — the
  8-puzzle, and grids where an exhaustive or uniform-cost oracle gives ground truth —
  rather than only against the game.
- Multi-goal routing reuses the same `aStar` with a different state type, at no cost.
- `key(state)` exists because JavaScript has no structural equality and no value types;
  the alternative was forcing every state into a string, which would be worse.
- There is real indirection: reading `aStar` does not tell you what a "state" is here.
  The adapters in `sim` are where that question is answered, and they are named after
  the game concepts they model to keep the jump short.
