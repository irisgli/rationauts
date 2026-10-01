# Security policy

## Scope

Rationauts is a browser game and a set of algorithm libraries. It has no server, no
accounts and no network calls, so the realistic threat surface is small: dependency
supply chain, and anything that could execute untrusted input.

The one place untrusted input genuinely enters the system is **replay files**. A
replay is JSON naming a scenario, a planner and the intents issued on each tick. It is
parsed and validated, never evaluated.

Three properties are deliberate and worth stating, because they are what keep the
surface small:

- **A replay cannot describe a world.** It names a scenario by id and the scenario is
  rebuilt from the compiled definition, so a file chooses which world to replay but
  never supplies one.
- **Every field is rebuilt, not passed through.** A parsed replay shares no structure
  with its input and carries no properties the parser did not construct.
- **Input is bounded before it is walked**, so a malformed file fails fast rather than
  allocating until the tab dies. See `REPLAY_LIMITS`.

A replay that causes a crash, unbounded memory growth or code execution is a security
bug, not just a correctness bug.

## Reporting a vulnerability

Please report privately through
[GitHub's private vulnerability reporting](https://github.com/irisgli/rationauts/security/advisories/new)
rather than opening a public issue.

Expect an acknowledgement within seven days. Since this is a personal project with no
deployment of consequence, there is no formal remediation SLA, but confirmed issues
are fixed on `main` before any other work.

## Supported versions

Only the current `main` branch is supported. There are no maintained release branches.
