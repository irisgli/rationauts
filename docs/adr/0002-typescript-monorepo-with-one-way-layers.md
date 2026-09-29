# 2. TypeScript monorepo with one-way layer boundaries

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

Rationauts has four concerns that evolve at different rates: a simulation engine, a
library of AI algorithms, a headless evaluation harness, and a browser client. They
have genuinely different requirements. The engine must be deterministic and fast. The
algorithm library should be usable by someone who has never heard of this game. The
harness needs a clock and a filesystem. The client needs the DOM.

Putting all four in one package would let the client's needs leak into the engine, the
classic failure where a "pure" core quietly grows a dependency on rendering.
Splitting them into four repositories would be worse: every change to the engine's
state shape would become a cross-repository version dance for no benefit at this size.

A second question sits underneath: which language. The algorithms are most idiomatic
in Python, which is also what both reference courses use. But a browser-playable
artefact was a hard requirement, and a Python core would mean either a second language
for the client or a WASM bridge, meaning two toolchains to keep excellent instead of
one.

## Decision

A single pnpm workspace with four packages and a strictly one-way dependency graph:

```
app  ->  sim  ->  agents
  \                 |
   ------------>  core
```

- `@rationauts/core`: the deterministic engine. Depends on nothing.
- `@rationauts/agents`: AI algorithms. Depends on nothing, deliberately (see ADR 4).
- `@rationauts/sim`: scenarios, runners, metrics, replay. Depends on core and agents.
- `@rationauts/app`: the browser client. Depends on all three.

The direction is enforced mechanically rather than by convention, using per-package
`no-restricted-imports` overrides in `eslint.config.js`. A violation fails CI.

The browser/headless split is enforced by the compiler: `tsconfig.headless.json`
typechecks `core`, `agents` and `sim` against a DOM-free `lib`, so a stray
`document` reference in the engine is a type error, not a code-review catch.

TypeScript throughout, with `strict`, `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes` enabled.

## Consequences

- One toolchain, one language, one test runner. The whole repo is `pnpm verify`.
- The algorithm library is publishable on its own merits.
- `noUncheckedIndexedAccess` costs a guard at most grid lookups. This is a real tax,
  paid deliberately: off-by-one errors in grid indexing are the single most common
  bug class in this kind of code, and the compiler now catches them.
- Writing search and MDP code in TypeScript is less idiomatic than in Python, and
  numeric performance is worse. Accepted in exchange for a live, clickable artefact.
