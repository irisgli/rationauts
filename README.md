<h1 align="center">Rationauts</h1>

<p align="center">
  A colony-building game whose tech tree is the classical AI curriculum.
</p>

<p align="center">
  <a href="https://github.com/irisgli/rationauts/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/irisgli/rationauts/actions/workflows/ci.yml/badge.svg"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-blue"></a>
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-strict-3178C6">
  <img alt="Node" src="https://img.shields.io/badge/node-%E2%89%A522-5FA04E">
  <img alt="Tests" src="https://img.shields.io/badge/tests-120-success">
</p>

<h3 align="center">
  <a href="https://irisgli.github.io/rationauts/">Play</a>
  <span> · </span>
  <a href="docs/design/0001-rationauts.md">Design</a>
  <span> · </span>
  <a href="docs/adr">Decisions</a>
  <span> · </span>
  <a href="docs/ROADMAP.md">Roadmap</a>
  <span> · </span>
  <a href="CONTRIBUTING.md">Contributing</a>
</h3>

---

Your bots start as reflex agents: they step toward what they want and get stuck on the
first wall. You make them smarter by installing techniques — breadth-first search, then
uniform-cost, then A\* with an admissible heuristic — and every map is built so the
previous one _visibly fails_ before the next is unlocked. The game is the argument for
why the algorithm exists.

The premise comes from [Autonauts](https://autonauts.fandom.com/), where you teach
robots by recording a literal loop of your own actions. Rationauts swaps that one axis:
you don't record a loop, you install a way of thinking.

<table>
<tr>
<th align="center" width="50%">Uniform-cost search · <code>513</code> tiles examined</th>
<th align="center" width="50%">A* · <code>182</code> tiles examined</th>
</tr>
<tr>
<td><img alt="Uniform-cost search floods almost the entire map" src="docs/assets/great-plain-uniform-cost.svg"></td>
<td><img alt="A* examines a narrow band hugging the route" src="docs/assets/great-plain-astar.svg"></td>
</tr>
</table>

Both return the same route at the same cost. The only difference between them is how
much of the map each had to look at — and that is the whole lesson. Teal is every tile
the planner expanded, shaded by when it got there. These images are
[generated from the library itself](packages/app/scripts/render-plate.ts), not
screenshotted.

## Getting started

```bash
pnpm install
pnpm dev
```

```bash
pnpm verify      # format, lint, typecheck, test — exactly what CI runs
pnpm sim bench   # every planner against every scenario, headless
```

Requires Node 22+ and pnpm 10+.

## Packages

| Package                                 | Description                                                                                                 |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| [`@rationauts/core`](packages/core)     | Deterministic simulation engine. No AI, no DOM, no dependencies.                                            |
| [`@rationauts/agents`](packages/agents) | Classical AI algorithms. Depends on nothing, [deliberately](docs/adr/0004-algorithms-are-game-agnostic.md). |
| [`@rationauts/sim`](packages/sim)       | Scenarios, runners, metrics, replay, benchmark CLI.                                                         |
| [`@rationauts/app`](packages/app)       | Browser client and search overlays.                                                                         |

Dependencies run one way — `app → sim → agents → core` — and ESLint fails the build if
that is violated.

## The curriculum

Each tier is motivated by a failure of the one before it.

| Tier                      | What breaks without it                                               | Techniques                                         |
| ------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| **Search** ✅             | A reflex bot walks into walls; a step-counting bot wades through mud | BFS, DFS, uniform-cost, A\*, admissible heuristics |
| Constraint satisfaction   | Bots deadlock over one shared workshop                               | Backtracking, forward checking, AC-3               |
| Optimisation              | Scarce inputs split across competing recipes                         | Linear and integer programming                     |
| Markov decision processes | Ice makes moves fail; the best plan is no longer a path              | Value iteration, policy iteration                  |
| Reinforcement learning    | Terrain costs are unknown until something walks on them              | Q-learning, approximate Q-learning                 |
| Probabilistic reasoning   | Fog of war and a noisy compass                                       | Bayes nets, HMMs, particle filters                 |
| Machine learning          | Ore sorted from noisy assay readings                                 | Naive Bayes, perceptron, decision trees            |
| Adversarial search        | A rival colony wants the same groves                                 | Minimax, expectimax, game theory                   |

Full plan in [ROADMAP.md](docs/ROADMAP.md).

## How it's built

Three properties are enforced by tooling rather than by discipline.

**Determinism.** `step(state, intents)` is a pure function. Same seed, same intents,
byte-identical result. `Math.random`, `Date` and `performance` are banned outright in
`core` and `agents`. → [ADR 3](docs/adr/0003-determinism-as-an-enforced-invariant.md)

**Algorithms don't know they're in a game.** `aStar` takes a `SearchProblem<S, A>`, so
it is validated against the eight-puzzle and against uniform-cost ground truth — not
just against this project's own levels. → [ADR 4](docs/adr/0004-algorithms-are-game-agnostic.md)

**Scenarios are the test suite.** Every level is a seeded, headless benchmark recording
ticks, path cost and nodes expanded. Each one declares which planners _cannot_ finish
it, and a test asserts exactly those fail — so a change that quietly makes the reflex
agent good enough breaks the build instead of hollowing out the lesson.

## Contributing

One AI technique per pull request. A tier isn't done until it has an implementation, a
test suite with an independent oracle, and a scenario the previous tier demonstrably
fails. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Credits

The curriculum follows two public courses — Carnegie Mellon
[15-281](https://www.cs.cmu.edu/~15281-f23/) and UC Berkeley
[CS 188](https://inst.eecs.berkeley.edu/~cs188/fa26/) — for the topic sequence and for
the idea that each technique should be introduced by the failure of the previous one.

**No code, assets, layouts or assignment material from either course is used here.**
Every fixture is original or procedurally generated.
→ [ADR 5](docs/adr/0005-no-course-materials-are-vendored.md)

## License

[MIT](LICENSE)
