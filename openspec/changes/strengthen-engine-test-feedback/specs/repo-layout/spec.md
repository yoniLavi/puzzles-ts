# repo-layout — delta

## ADDED Requirements

### Requirement: A shared module's tests give feedback where the code lives

A module in `src/native/engine/` SHALL be able to fail its **own** test file when
its behaviour changes, and not rely solely on a consumer's tests or a game's
frozen differential to notice. Coverage and feedback are different properties,
and this repository has measured itself strong on the first and weak on the
second: `latin.ts` is killed by its own test file 9 times out of 593, `grid.ts`
once out of 40 — while `grid.ts` has **zero** surviving mutants, so it is fully
protected and almost silent.

That combination is specifically harmful here, because the repository's own
test-run economy tells a developer to run the files they touched and let the
commit hook be the single full run. Applied to an engine module with 2% local
kills, that advice returns green on a broken module.

The measurable form of this property is the share of a module's killed mutants
that its own test file killed. It is a **diagnostic, not a ratchet** — the
mutation-score prohibition applies unchanged, and a test written to move this
number rather than to state a behaviour is worse than no test.

Where a module's guarantee genuinely belongs to a differential — an RNG draw
order, a region sizing that decides which boards exist — that division of labour
SHALL be stated in the module's test file and **verified**, by confirming the
differential does fail on the mutation the local tests deliberately let through.

#### Scenario: Logic is extracted into the engine

- **WHEN** logic moves from a game into `src/native/engine/`
- **THEN** its tests are written in the same change
- **BECAUSE** extraction moves the code but not its tests: the game's
  differential still catches defects, so nothing turns red and the module
  silently arrives with no local assertions

#### Scenario: A module is fully protected but locally silent

- **WHEN** a module has few or no surviving mutants but a low share killed by its
  own test file
- **THEN** that is a feedback defect to fix, not a coverage success to report
- **BECAUSE** the failure it produces is a green targeted run on a broken module,
  during exactly the refactoring work the tests exist to make safe
