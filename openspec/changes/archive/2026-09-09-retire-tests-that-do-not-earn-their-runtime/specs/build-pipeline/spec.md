# build-pipeline — delta

## ADDED Requirements

### Requirement: A test is retired or deferred by measurement, never by category

A test SHALL be judged by what it would catch in a refactor that **no cheaper
test would**, and never by the era or the category it belongs to. "It was
written for the port" is not by itself a reason: the frozen `c-reference`
differentials are porting artifacts *and* the strongest net under solver
refactoring, because a change to a solver's verdict changes which boards exist.

Before anything is retired or deferred, the population SHALL be **ranked and
counted** — how many test files were examined, and how many classified — so an
audit cannot quietly look at the dozen files somebody remembered.

Measured 2026-09-09 over all 301 test files, and recorded here because it is the
result a later session would otherwise re-derive: the differentials are **10.1%**
of suite time across 50 files, with the heaviest single one at 11.5 s CPU. The
category most obviously "porting-era" was therefore the cheap half, and retiring
by category would have cut it while leaving the expense untouched.

#### Scenario: A retirement is proposed for a category of tests

- **WHEN** a change proposes to retire tests because of what they were written for
- **THEN** it ranks the population by measured cost first, and answers per file
  what that file uniquely protects
- **BECAUSE** the era a test was written in does not predict what it catches, and
  here the two were anti-correlated

#### Scenario: A configuration would lose its last cover

- **WHEN** retiring or deferring a test would leave a mode, grid type, difficulty
  or board size with nothing asserting it on every commit
- **THEN** the test stays, however slow, unless the change names the test that
  still covers that configuration at the site of the change
- **BECAUSE** a silently removed configuration reads identically to one that was
  never covered

### Requirement: Suite cost is attributed per game, and quoted in CPU

A measurement of what the test suite costs SHALL attribute each cross-game
guard's per-game case to **the game it names**, not to the file or directory the
guard lives in. The guards title their cases `"<gameId>: …"`, which is the join
key.

Attribution by directory reports the cross-game guards as undifferentiated
engine cost and hides which game makes them expensive: measured 2026-09-09,
Sixteen is 17% of suite time by directory and **30%** once its cases inside
`hint-resume.test.ts` and `hint-quality.test.ts` are counted, and three games
account for 52% of all test time.

Every cost figure SHALL be **CPU (`user + sys`)** from `/usr/bin/time` on a
single-file run. Wall clock on a shared box measures the contention, and it does
so *unevenly* — in the same run one file inflated 5.2× and another 1.6× — so a
contended wall figure distorts the ranking, not merely the total. Summed
per-test duration remains permissible for **locating** cost, and for nothing
else.

#### Scenario: A suite-cost finding is reported

- **WHEN** a change reports what a test file or a game costs the suite
- **THEN** the figure is CPU time, and the machine's load at the time is stated
- **BECAUSE** the first figure ever recorded for this question was taken at load
  533 and measured the contention

### Requirement: The opt-in slow tier is invokable for one area at a time

`npm run test:slow` SHALL forward its arguments to the test runner, and the
targeted form SHALL be documented where the tier is defined, because the bare
command re-runs the **entire** gate suite as well as the deferred cases and the
widened seed budgets.

Measured 2026-09-09: the deferred tier is **six tests in three files**, while the
command that runs it also runs 8,504 gate tests with the heaviest files
multiplied 3–7.5×. A change that defers work into the tier SHALL therefore say
which targeted invocation exercises it — `npm run test:slow -- <path>` — rather
than relying on a whole-tier run that a person will decline to wait for.

#### Scenario: Work is deferred into the slow tier

- **WHEN** a test or fixture is moved out of the per-commit path
- **THEN** the change names the targeted command that runs it, and the site
  states what still covers the configuration on every commit
- **BECAUSE** a tier nobody invokes is not coverage, and a tier that can only be
  invoked whole is a tier nobody invokes

### Requirement: A cross-game guard bounds its cost on the axis the game varies

Where a cross-game guard walks a game's presets, it SHALL slice them on the axis
that game actually varies, and it SHALL derive any cost exemption from a
property the game already has rather than from a list of game ids.

A hint that plans by **searching** pays for board size twice over — one full
search per move, and more moves to make on a bigger board — while a guard that
recomputes a hint after every move multiplies exactly that. Such games SHALL be
sliced by board size in the gate and walked in full in the slow tier, with the
population derived from the game's own source (`SEARCH_PLANNING_GAMES` reads
each game for a call to the shared slide planner) rather than declared.

The reason a member is sliced, and the test that still covers its largest board
on every commit, SHALL be recorded **per member**, with the derivation asserted
to be exactly the ledger — so a game that later joins the mechanic fails the
guard until someone writes that sentence.

#### Scenario: A game joins the searching-hint population

- **WHEN** a new game's hint calls the shared slide planner
- **THEN** it is enrolled by the derivation automatically, and the ledger's
  equality assertion fails until its entry names what covers its largest board
- **BECAUSE** an exemption roster rots exactly as quietly as the membership
  roster it replaced
