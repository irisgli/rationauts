# Contributing

## Getting set up

```bash
pnpm install
pnpm verify
```

`pnpm verify` runs formatting, linting, typechecking and tests — byte for byte the gate
CI runs. If it is green locally, CI will be green.

## The shape of a change

One AI technique per pull request. A tier is not "done" until it has an implementation,
a test suite with an independent oracle, at least one scenario that the previous tier
demonstrably fails, and a line in the roadmap moved from pending to shipped.

Small, self-contained pull requests are strongly preferred. If a change touches more
than one package, say why in the description.

## Invariants you must not break

These are enforced automatically, but knowing why they exist saves you a round trip.

1. **Determinism.** No `Math.random`, `Date` or `performance` in `@rationauts/core` or
   `@rationauts/agents`. Randomness comes from the seeded generator in `WorldState`.
   `@rationauts/sim` may read the clock; measuring is its job.
2. **Layering.** `app → sim → agents → core`, one way only. `@rationauts/agents`
   depends on nothing, including `core` — adapters belong in `sim`.
3. **No DOM below the client.** `core`, `agents` and `sim` typecheck against a DOM-free
   `lib` via `tsconfig.headless.json`.
4. **No course material.** See [ADR 5](docs/adr/0005-no-course-materials-are-vendored.md).

## Tests

A test should fail if you revert the change it covers. Beyond that:

- **Prefer an independent oracle to a golden value.** A\* is checked against
  uniform-cost search, not against a path someone pasted in once. When the oracle is
  expensive, use it on small instances and use golden files for large ones.
- **Property-based tests for invariants** (`fast-check` is available): a shuffle is a
  permutation, a heuristic never exceeds true cost, `step` never mutates its input.
- **Coverage thresholds are a floor, not a goal.** 90% lines on the headless packages.

## Commits

[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/):

```
feat(agents): add A* with an admissible manhattan heuristic
fix(core): resolve intents in bot-id order so replays are stable
docs(adr): record why course materials are not vendored
```

Types: `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`.
Scopes are package names (`core`, `agents`, `sim`, `app`) or `adr`, `repo`.

Write the body for someone doing `git blame` in a year. Explain _why_, not _what_ —
the diff already says what.

## Architecture decisions

If a change constrains future work — a new layer, a cross-cutting invariant, a
dependency that is hard to remove, a deliberate deviation from an obvious default —
add an ADR in `docs/adr/` and link it from the pull request. Ordinary feature work does
not need one. See [ADR 1](docs/adr/0001-record-architecture-decisions.md).
