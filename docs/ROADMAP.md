# Roadmap

Rationauts ships one curriculum tier at a time. A tier is complete when it has an
implementation, a test suite with an independent oracle, and at least one scenario that
the _previous_ tier measurably fails. That failure is the pedagogy, and it is also the
regression test that stops a later refactor from quietly making the earlier tier good
enough.

## Shipped

### Search

- Reflex, breadth-first, depth-first, uniform-cost and A\* navigators
- `SearchProblem<S, A>` interface; algorithms independent of the game
- Admissible Manhattan heuristic, scaled by minimum step cost
- Multi-goal routing over `(position, visited)` state
- Five scenarios forming the difficulty ladder
- Benchmark harness recording ticks, path cost and nodes expanded

## Planned

Ordered by dependency, not by priority. Each line is roughly one pull request.

### Constraint satisfaction

The colony gains a single workshop that only one bot may occupy per shift, and recipes
that require specific stations. Greedy allocation deadlocks.

- `CSP<Variable, Value>` interface with constraint propagation
- Backtracking search; forward checking; AC-3
- Minimum-remaining-values and least-constraining-value heuristics
- Scenario `foundry`: shift scheduling across contended stations

### Optimisation

Scarce inputs must be divided between competing recipes to maximise output.

- Simplex for linear programs; branch-and-bound for integer programs
- Scenario `rationing`: allocate a fixed harvest across recipes

### Markov decision processes

Ice tiles make moves fail with known probability. A plan is no longer a path.

- `MDP<S, A>` interface; value iteration and policy iteration
- Scenario `glacier`: stochastic movement with a cliff worth avoiding

### Reinforcement learning

Terrain costs become unknown until a bot has walked on them.

- Q-learning and approximate Q-learning with feature extractors
- Epsilon-greedy exploration with a seeded schedule
- Scenario `terra-incognita`: learn the cost map by exploring it

### Probabilistic reasoning

Fog of war, plus a compass that lies a known fraction of the time.

- Bayes net representation, exact inference by variable elimination, likelihood sampling
- Hidden Markov models; forward algorithm; particle filtering
- Scenario `fogbank`: localise a lost bot from noisy readings

### Machine learning

Ore arrives with noisy assay readings and must be sorted before smelting.

- Naive Bayes, perceptron, decision trees
- Scenario `assay`: classify ore quality under label noise

### Adversarial search and game theory

A rival colony competes for the same groves.

- Minimax, alpha-beta pruning, expectimax
- Evaluation functions; equilibrium analysis of contested resources
- Scenario `rivals`: two colonies, one forest

## Infrastructure

- Replay file format with a versioned schema and validation
- Published benchmark results tracked over time in CI
- Unpin TypeScript once `typescript-eslint` supports 7.x
  ([ADR 6](adr/0006-pin-typescript-6-until-eslint-supports-7.md))

## Explicitly not planned

- Multiplayer or any server component. The game is offline by design, which is what
  keeps the security surface at "parses replay JSON".
- Deep learning tiers. Transformers appear in the reference syllabus, but a
  from-scratch implementation would dominate the repository without teaching anything
  the earlier tiers do not already teach better.
- Procedural art or audio. Effort goes into legibility of the algorithms instead.
