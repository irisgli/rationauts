# Design: Rationauts

- **Date:** 2026-09-28
- **Status:** Approved; Search tier implemented

## The idea

Autonauts' central mechanic is that you teach robots by recording your own actions as a
literal script. The robots are dumb loops, and the comedy comes from watching a loop
meet a world that has moved. The player's ceiling is their own ability to program.

Rationauts keeps the colony-building frame and swaps that one axis. You do not record a
loop; you install a technique. The tech tree is the classical AI curriculum, and the
world is designed so that each technique is introduced by the _visible failure_ of the
one before it.

This inverts the usual relationship between a game and its tutorial. The scenario is
not an explanation of the algorithm. It is the argument for the algorithm's existence.

## Goals

1. A reviewer can open a link, play it, and understand within a minute what it is.
2. A reader can open `@rationauts/agents` and find algorithms worth reading, validated
   against oracles rather than against themselves.
3. Every scenario doubles as a reproducible benchmark.

### Non-goals

- Fun as the primary success metric. This is engineering-first by intent.
- Breadth over depth. One finished tier beats eight sketched ones.
- Fidelity to either reference course's assignments. See ADR 5.

## Architecture

Four packages, one-way dependencies (ADR 2):

```
app  ->  sim  ->  agents
  \                 |
   ------------>  core
```

### `@rationauts/core`

A tile grid, entities (bots, resource nodes, depots), and one transition function:

```ts
step(state: WorldState, intents: readonly Intent[]): { state: WorldState; events: readonly SimEvent[] }
```

Pure. No clock, no ambient randomness; the seeded PRNG lives inside `WorldState` and is
threaded functionally. Intents are normalised into bot-id order before resolution so
that contention between agents does not depend on the caller's array order (ADR 3).

The key modelling decision is that **terrain cost is spent in time, not merely scored**.
Entering a tile of cost _C_ puts the bot on cooldown for _C_ ticks. Mud costs eight.
A breadth-first router that optimises step count therefore does not just score worse
than uniform-cost search. It visibly crawls, on screen, while the player watches. The
cost table is the game's core tuning surface precisely because it is what separates one
algorithm from the next.

### `@rationauts/agents`

Depends on nothing, including `core` (ADR 4). Algorithms are written against structural
problem interfaces:

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

`key` exists because JavaScript has neither structural equality nor value types, and
forcing every state into a string would be worse.

### `@rationauts/sim`

The binding layer: adapters expressing the game's problems as `SearchProblem`s,
scenario definitions, seeded runners, metrics, replay record and playback, and the CLI.
This is also where wall-clock measurement is allowed.

### `@rationauts/app`

React and canvas. Rendering, the module-install interface, and the debug overlays that
make the algorithms legible: the A\* frontier, expansion counts, the chosen path
against the path the previous tier would have taken.

## The Search tier

Five scenarios, each engineered so the previous module fails:

| Scenario      | Forces                                                        |
| ------------- | ------------------------------------------------------------- |
| `open-field`  | nothing; a reflex agent suffices                              |
| `wall-gap`    | reflex gets stuck on a wall → breadth-first search            |
| `mudflats`    | BFS wades through mud → uniform-cost search                   |
| `great-plain` | UCS expands the whole map → A\* with a heuristic              |
| `four-groves` | single-goal routing is wrong → multi-goal state and heuristic |

Metrics per run: ticks elapsed, total path cost, **nodes expanded**, wall-clock. Nodes
expanded is what makes `great-plain` legible: A\* and UCS return paths of identical
cost, and the only visible difference is how much of the map each one had to look at.

## Testing strategy

- **Independent oracles over golden values.** A\* is checked against uniform-cost
  search on the same instance: same cost, fewer expansions. Admissibility is checked by
  comparing the heuristic against true cost-to-go computed by exhaustive search on small
  grids.
- **Property-based tests** for invariants: `step` never mutates its input; shuffles are
  permutations; a heuristic never overestimates; caller intent order never matters.
- **Golden replays** for whole scenarios, so a refactor that changes which of several
  equal-cost optimal paths is chosen is caught rather than silently absorbed.
- **Fixtures are original or generated.** A seeded maze generator supplies adversarial
  cases at any size and feeds the benchmark suite directly (ADR 5).

## Risks

- **Scope.** Eight tiers is more than one person finishes. Mitigated by making each tier
  independently shippable and the repository useful after any one of them.
- **TypeScript for numeric AI code.** Less idiomatic and slower than Python. Accepted in
  exchange for a single toolchain and a clickable artefact (ADR 2).
- **The failure-driven ladder could feel punitive** rather than instructive. Mitigated by
  overlays that show _why_ a module failed: the wall it hit, the mud it crossed, the
  fraction of the map it searched.
