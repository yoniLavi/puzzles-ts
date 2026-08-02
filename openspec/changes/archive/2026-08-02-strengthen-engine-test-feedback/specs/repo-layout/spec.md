# repo-layout — delta

## ADDED Requirements

### Requirement: A shared module's tests give feedback where the code lives

A module in `src/native/engine/` SHALL be able to fail its **own** tests when its
behaviour changes, and not rely solely on a consumer's tests or a game's frozen
differential to notice.

Coverage and feedback are different properties. The failure this requirement
prevents is specific: this repository's test-run economy tells a developer to run
the files they touched and let the commit hook be the single full run, so a
module whose own tests cannot see its defects returns **green on a broken
module** — during exactly the refactoring the tests exist to make safe.

The measurable form is: **plant a real defect, run only the module's own tests,
and see whether they fail.** `scripts/feedback-probe.mjs` (`npm run probe`) is
that measurement, with a committed corpus of hand-chosen defects. It is a
**diagnostic, not a ratchet** — the mutation-score prohibition applies unchanged,
and a test written to move this number rather than to state a behaviour is worse
than no test. A case argued behaviour-preserving is recorded as such and excluded
from the rate rather than chased.

Two definitions are load-bearing and SHALL be derived rather than assumed:

- **A module's own tests** are every engine test file that *imports* it — not one
  file named after it. Both directions of that mistake have been made here:
  `grid-core.ts` is tested by `grid-trim.test.ts`, and `midend.test.ts` alone is
  not the midend's tests either (eight engine files drive a `Midend`).
- **A differential is not a local test**, even an engine-local one, because its
  guarantee is a frozen fixture noticing that the boards moved.

Where a module's guarantee genuinely belongs to a differential — an RNG draw
order, a region sizing that decides which boards exist — that division of labour
SHALL be stated in the module's test file and **verified**, by confirming the
differential does fail on the defect the local tests deliberately let through.

#### Scenario: Logic is extracted into the engine

- **WHEN** logic moves from a game into `src/native/engine/`
- **THEN** its tests are written in the same change
- **BECAUSE** extraction moves the code but not its tests: the game's
  differential still catches defects, so nothing turns red and the module
  silently arrives with no local assertions

#### Scenario: A module is fully protected but locally silent

- **WHEN** a module has few or no surviving mutants but its own tests do not fail
  on a defect planted in it
- **THEN** that is a feedback defect to fix, not a coverage success to report
- **BECAUSE** the failure it produces is a green targeted run on a broken module

#### Scenario: A feedback metric is derived from a tool's internals

- **WHEN** a claim about where feedback lives is derived from a field a tool
  emits, rather than from planting a defect and running the tests
- **THEN** the field's documented meaning is checked before the claim is acted on
- **BECAUSE** Stryker's `killedBy` names the first covering test to fail — the
  runner bails there — so it measures *file execution order*, and reading it as
  "the tests capable of catching this" ranked `grid.ts` second-worst when its own
  tests catch every planted defect, and `midend.ts` mid-table when it was the
  worst. That ranking reached a proposal and a spec before it was measured.
