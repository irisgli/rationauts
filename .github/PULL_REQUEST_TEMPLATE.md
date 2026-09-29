## What changed

<!-- One paragraph. What does this PR do, and why now? -->

## Why this approach

<!-- The alternatives you considered and why you rejected them. If this PR makes a
     decision that is expensive to reverse, add an ADR under docs/adr/ and link it. -->

## How it was verified

<!-- Not "tests pass". Say what you actually checked. -->

- [ ] `pnpm verify` passes locally
- [ ] New behaviour is covered by tests that fail without the change
- [ ] Determinism preserved: no new use of `Math.random`, `Date.now` or ambient state
      in `@rationauts/core` or `@rationauts/agents`

## Risk and rollback

<!-- What could this break? How would you undo it? "Revert the commit" is a fine
     answer when it is true; say so explicitly. -->

## Screenshots / output

<!-- For UI changes, before and after. For algorithm changes, benchmark output. -->
