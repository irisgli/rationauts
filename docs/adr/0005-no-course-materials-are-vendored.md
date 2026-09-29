# 5. No course materials are vendored

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

Rationauts takes its curriculum from two public university courses: Carnegie Mellon's
15-281 and UC Berkeley's CS 188. Berkeley's Pacman projects in particular ship a large
amount of reusable material (maze layouts, an autograder, agent scaffolding), and it
would be quick to import the maze files as test fixtures.

Two problems. First, licensing: the Berkeley Pacman projects are distributed for
educational use at academic institutions with attribution conditions, which is not the
same as a permissive licence, and this repository is MIT-licensed and public. Second,
course policy: both courses ask that solutions to their assignments not be published,
and a public repository containing recognisable project code invites exactly that
reading even when the code is original.

## Decision

No code, assets, layouts, test cases or autograder material from either course is
copied into this repository, in any form, including transcribed or lightly renamed.

The courses are credited in the README as the source of the _curriculum_: the topic
sequence and the pedagogical idea that each technique should be motivated by the
failure of the previous one. Ideas and topic ordering are not copyrightable; their
expression is.

Test fixtures are original: hand-authored ASCII maps written for this project, plus
mazes generated procedurally from a seed. Correctness is established against oracles
that are computed rather than copied: uniform-cost search as ground truth for A*, and
exhaustive enumeration on small instances.

## Consequences

- The repository is unambiguously safe to publish, and contains nothing that could be
  mistaken for coursework or for a solution set.
- Fixtures must be built rather than borrowed. This turned out to be a benefit: a
  seeded maze generator produces adversarial cases at any size, which a fixed set of
  hand-drawn mazes cannot, and it feeds the benchmark suite directly.
- Comparisons to the reference courses' own results are not possible. Nothing depends
  on them.
