# 1. Record architecture decisions

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

Rationauts is built as a long sequence of small, self-contained additions, one AI
technique per pull request. That shape makes it easy to lose the _reasoning_ behind
choices: six months in, the code says what it does, but not why it was allowed to do
it that way, and the alternatives that were rejected are invisible.

The decisions most worth preserving are the ones that are expensive to reverse:
layering, the determinism contract, the public shape of the algorithm interfaces.

## Decision

We keep architecture decision records in `docs/adr/`, in the format described by
Michael Nygard, numbered sequentially and never renumbered.

An ADR is required when a change constrains future work: a new layer, a new
cross-cutting invariant, a dependency that is hard to remove, or a deliberate
deviation from an obvious default. Ordinary feature work does not need one.

ADRs are immutable once accepted. A decision that turns out to be wrong is not
edited; a new ADR supersedes it, and the old one is marked `Superseded by NNNN`.

## Consequences

- The pull request template asks for an ADR link when a change is hard to reverse.
- Reviewers can push back on _the decision_ separately from the implementation.
- There is a small ongoing cost: roughly twenty minutes per significant decision.
- Reading `docs/adr/` in order is the fastest way for a newcomer to understand why
  the codebase looks the way it does.
