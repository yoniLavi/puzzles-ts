# retire-completed-migration-requirements

## Why

Sweeping the applied specs for the names `retire-c-engine` deleted (a check that
change's own deltas should have included, and `fix-ci-after-c-retirement` added
to the playbook) turned up six requirements across five specs that still assert
obligations about machinery that no longer exists.

They fall into two kinds, and the distinction decides the treatment:

- **A completed one-time transition.** Three per-game specs (`lightup`,
  `pattern`, `separate`) carry a "parity-gated, then served from TS with its C
  deleted" requirement, and `ts-migration` carries the general "Per-game hybrid;
  C deleted per game". These described a *migration event* — register, smoke-test
  on the C fallback, flip `TS_PORTED`, delete the `.c`. Every one of those events
  has happened, and none can happen again: there is no C, no `TS_PORTED`, no
  fallback. A requirement whose trigger can never fire is not a safeguard, it is
  a misleading description of the system. **Remove them.**
- **A live requirement with a dead clause.** `combi`'s corpus requirement is
  still doing real work — the fixture is the oracle for a module Light Up's
  solver imports today — but its regeneration path (`puzzles/auxiliary/combi-trace.c`,
  `CMakeLists.txt`, `./scripts/build-native.sh`) is deleted. **Modify it**: keep
  the coverage obligations, retire the regeneration scenario, and say what the
  fixture now is.

**The one thing that must not be lost in the removals** is the parity bar itself:
*owner acceptance, not a green automated suite, decides that game work is done*
— the lesson Flip's three-iteration rendering saga bought and
`add-parity-gated-registration` encoded. That is not a migration mechanic and it
outlives the migration, so `ts-migration` keeps it as a requirement in its own
right, stripped of the C-fallback machinery it happened to be written around.

## What Changes

- **Remove** the three per-game "parity-gated, C deleted" requirements
  (`lightup`, `pattern`, `separate`) — completed events, recorded in the
  archived changes and in git history.
- **Replace** `ts-migration`'s "Per-game hybrid; C deleted per game" with a
  requirement stating the surviving obligation: game work is accepted by the
  owner exercising it, not by a green suite.
- **Modify** `combi`'s corpus requirement: keep the edge-case coverage, drop the
  regenerate-from-the-C-harness scenario, state that the committed corpus is now
  the frozen oracle (the same position as the 48 per-game differentials).

## Impact

- Affected specs: `ts-migration`, `lightup`, `pattern`, `separate`, `combi`.
- Affected code: none. This is spec text only — the code these requirements
  described is already gone or already correct.
