# 6. Pin TypeScript to 6.x until typescript-eslint supports TypeScript 7

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

TypeScript 7.0 is the native compiler port and installs by default as `typescript@latest`.
It typechecks this repository without complaint and is substantially faster.

However, `typescript-eslint` does not yet support the TypeScript 7 API and refuses to
load against it. That disables every type-aware lint rule in the project, which is not
a cosmetic loss: `no-unnecessary-condition`, `switch-exhaustiveness-check` and
`no-floating-promises` are the rules doing the most work here, and the first of them
has already caught a real defect: an unreachable `undefined` branch in the quota
check that the compiler was happy with.

The documented workaround is to install TypeScript 6 side by side with TypeScript 7 and
point the linter at the older API. That works, but it means two compilers in the
lockfile and a non-obvious resolution rule for anyone reading the config.

## Decision

Pin `typescript` to `6.0.3` at the workspace root, and revisit when `typescript-eslint`
ships TypeScript 7 support.

## Consequences

- Full type-aware linting stays on, which is the point of the setup.
- Builds are slower than they would be on the native compiler. At this repository's
  size the difference is under a second and does not matter.
- The pin is exact rather than a caret range, so the upgrade is a deliberate, visible
  change rather than something that happens during an unrelated install.
- Tracking: unpin once typescript-eslint declares support (issue #10940 upstream).
