# Rationauts

A colony-building game whose tech tree is the classical AI curriculum.

Your bots start as reflex agents: they step toward whatever they want and get stuck on
the first wall. You make them smarter by installing techniques — breadth-first search,
then uniform-cost, then A\* with an admissible heuristic — and the world is built so
that each one _visibly fails_ before the next is unlocked. The game is the argument for
why the algorithm exists.

The premise is borrowed from [Autonauts](https://autonauts.fandom.com/), where you
teach robots by recording a literal loop of your own actions. Rationauts swaps that one
axis: you do not record a loop, you install a way of thinking.

**[Play it](https://irisgli.github.io/rationauts/)** — pick a sheet, install a module, press Run.

> **Status:** early. The Search tier is complete and playable. Later tiers are
> tracked in [docs/ROADMAP.md](docs/ROADMAP.md).

## Why this repository might interest you

It is a game, but the engineering is the point:

- **The simulation is a pure function.** `step(state, intents) -> { state, events }`
  consults no clock and no ambient randomness. Same seed, same intents, byte-identical
  result — enforced by lint rules, not by discipline. See
  [ADR 3](docs/adr/0003-determinism-as-an-enforced-invariant.md).
- **The algorithms do not know they are in a game.** `@rationauts/agents` depends on
  nothing at all. `aStar` takes a `SearchProblem<S, A>`, so it is validated against the
  8-puzzle and against uniform-cost ground truth, not just against this project's own
  levels. See [ADR 4](docs/adr/0004-algorithms-are-game-agnostic.md).
- **The test suite and the game levels are the same artefact.** Every scenario is a
  headless, seeded benchmark that records ticks, path cost and nodes expanded, and also
  a level you can play.
- **The client draws what the planner looked at.** On `great-plain`, A\* and
  uniform-cost search return the same route at the same cost; A\* examines 573 tiles
  and uniform-cost examines 1,664. The overlay is that difference, shaded by expansion
  order, and it is the one thing a table cannot show you.

## Quick start

```bash
pnpm install
pnpm dev          # browser client at http://localhost:5173
```

```bash
pnpm verify       # format, lint, typecheck, test — the same gate CI runs
pnpm sim bench    # headless benchmark across every scenario
```

Requires Node 22 or newer and pnpm 10 or newer.

## Layout

```
packages/
  core/     deterministic simulation engine — no AI, no DOM, no dependencies
  agents/   game-agnostic AI algorithms — depends on nothing, deliberately
  sim/      scenarios, runners, metrics, replay; binds agents to the engine
  app/      browser client and algorithm debug overlays
```

Dependencies run strictly one way — `app → sim → agents → core` — and ESLint fails the
build if that is violated. `tsconfig.headless.json` typechecks the first three packages
against a DOM-free `lib`, so the engine cannot quietly acquire a browser dependency.

## The curriculum

Each tier is motivated by a failure of the one before it.

| Tier                      | What breaks without it                                               | Techniques                                         |
| ------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| **Search** ✅             | A reflex bot walks into walls; a step-counting bot wades through mud | BFS, DFS, uniform-cost, A\*, admissible heuristics |
| Constraint satisfaction   | Bots deadlock over a single shared workshop                          | Backtracking, forward checking, AC-3, heuristics   |
| Optimisation              | Scarce inputs must be split across competing recipes                 | Linear and integer programming                     |
| Markov decision processes | Ice makes moves fail; the best plan is no longer a path              | Value iteration, policy iteration                  |
| Reinforcement learning    | Terrain costs are unknown until something walks on them              | Q-learning, approximate Q-learning                 |
| Probabilistic reasoning   | Fog of war and a noisy compass                                       | Bayes nets, HMMs, particle filters                 |
| Machine learning          | Ore must be sorted from noisy assay readings                         | Naive Bayes, perceptron, decision trees            |
| Adversarial search        | A rival colony competes for the same groves                          | Minimax, expectimax, game theory                   |

## Credits and licensing

The curriculum follows two public courses — Carnegie Mellon
[15-281](https://www.cs.cmu.edu/~15281-f23/) and UC Berkeley
[CS 188](https://inst.eecs.berkeley.edu/~cs188/fa26/) — as the source of the topic
sequence and of the idea that each technique should be introduced by the failure of the
previous one.

**No code, assets, layouts or assignment material from either course is used here.**
Every fixture is original or procedurally generated. The reasoning is written up in
[ADR 5](docs/adr/0005-no-course-materials-are-vendored.md).

Licensed under the [MIT License](LICENSE).
