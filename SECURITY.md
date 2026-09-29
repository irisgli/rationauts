# Security policy

## Scope

Rationauts is a browser game and a set of algorithm libraries. It has no server, no
accounts and no network calls, so the realistic threat surface is small: dependency
supply chain, and anything that could execute untrusted input.

The one place untrusted input genuinely enters the system is **replay files**. A
replay is JSON describing an initial state and a list of intents. It is parsed and
validated, never evaluated. A replay that causes a crash, unbounded memory growth or
code execution is a security bug, not just a correctness bug.

## Reporting a vulnerability

Please report privately through
[GitHub's private vulnerability reporting](https://github.com/irisgli/rationauts/security/advisories/new)
rather than opening a public issue.

Expect an acknowledgement within seven days. Since this is a personal project with no
deployment of consequence, there is no formal remediation SLA, but confirmed issues
are fixed on `main` before any other work.

## Supported versions

Only the current `main` branch is supported. There are no maintained release branches.
