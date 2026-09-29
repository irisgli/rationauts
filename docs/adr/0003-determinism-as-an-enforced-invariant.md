# 3. Determinism as an enforced invariant

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

Nearly everything Rationauts wants to do downstream depends on being able to replay a
simulation exactly: golden-file tests that assert on a specific path rather than only
its cost, benchmark comparisons between two planners, bug reports reduced to a
scenario name and a seed, and, later, reinforcement learning, where a stochastic
environment must still be reproducible across runs.

Determinism is easy to state and very easy to lose. One `Math.random` in a tie-break,
one `Date.now` in a cooldown, one iteration over a `Set` whose insertion order depends
on caller behaviour, and replays silently stop matching. The failure is quiet, which
is what makes it dangerous.

## Decision

Determinism is a hard invariant of `@rationauts/core` and `@rationauts/agents`, and it
is enforced by tooling rather than by discipline.

1. **All randomness is seeded and explicit.** A mulberry32 generator lives in
   `WorldState.rng` and is threaded through purely: `nextUint32(rng)` returns both the
   value and the advanced generator, and never mutates its argument.
2. **`Math.random`, `Date` and `performance` are banned** in both packages via
   `no-restricted-globals` and `no-restricted-properties`. `@rationauts/sim` is exempt
   because measuring wall-clock time is its job and it is not part of the transition.
3. **`step` is a pure function.** It never mutates its input and consults no ambient
   state. A test asserts this by deep-cloning the input and comparing afterwards.
4. **Intent order is normalised.** `step` sorts intents by bot id instead of trusting
   the caller's array order, so two agents contending for the same tile always resolve
   the same way regardless of how the caller collected their intents.
5. **Successor order is fixed.** `DIRECTIONS` is north, east, south, west, and every
   algorithm expands in that order, so ties between equal-cost optimal paths break
   identically everywhere.

## Consequences

- A scenario is fully described by `(initialState, seed, intents)`. Replays are
  therefore a list of intents, not a list of states, which keeps them small and
  diffable.
- Tests can assert exact paths. This catches a whole class of subtle regressions that
  cost-only assertions miss, such as an unstable priority queue.
- The purely functional PRNG is more verbose at call sites than a mutable one. That
  verbosity is the point: it makes an un-threaded generator a visible mistake.
- `WorldState.rng` is unused by the Search tier. It is present anyway, because adding
  a random source to the state type after replay files exist would break them.
