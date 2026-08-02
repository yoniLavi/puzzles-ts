# audit-test-suite-strength — findings

The triage is the artefact: a diff cannot show that a survivor was *considered*.
Same shape as `tighten-type-checking/findings.md`.

**Four instruments were run, and the expensive one was not the most productive.**
The mutation run over the engine (§4) is the systematic instrument and the reason
"nothing else survives" can be said at all. But the audit's sharpest result (§3)
came from the *sanity check* the change mandated before trusting the harness —
five minutes of work — and two more (§1, §5) came from purpose-built scripts that
run in under a second. That ordering is itself a finding, and §6 acts on it.

Section map: §0 method; §1 snapshots; §2 differentials; §3 the fixpoint grade;
§4 the mutation run; §5 modules with no local test; §6 what persists.

---

## 0. Method note, found the hard way — an instrument's *unit* is part of its correctness

The snapshot-pairing check below was first written to measure **per `it(...)`
block**, and reported **six unpaired snapshots**. All six were phantom. Four are
in `slide-render.test.ts`, which deliberately gives each frame a `describe`
holding several targeted-assertion tests *plus* one bare
`it("matches its snapshot")` — the drift-catcher separated from the guarantee,
which is arguably the tidier layout of exactly the rule being checked. Measured
per `describe`, the same code scores **0 unpaired out of 69**.

This is the failure mode this change exists to detect, met inside the tool built
to detect it — the third instrument in this project's recent history to pass
while measuring the wrong thing (after the complexity ratchet that hid its own
suppressions and the lint config that manufactured 35 phantom findings). The
transferable rule: **before believing an instrument's count, check that its unit
of measurement is the unit the rule is about.** A stricter unit does not make a
check more conservative; it makes it wrong in the other direction.

---

## 1. Snapshot pairing: measured, and the rule is followed everywhere

The repo's own rule is *"pair every snapshot with a few targeted assertions so a
careless `vitest -u` can't erase the guarantee."* It had never been checked.

- **99 snapshot-asserting tests across 62 files, in 69 `describe` scopes.**
- **0 scopes where the snapshot is the only assertion.**

Structural presence is not the same as load-bearing, so it was also tested
directly: a real render bug was injected into `crossing/render.ts` (the hint's
`COL_HINT_CELL` wash replaced by `COL_BACKGROUND`) and the suite run **with
`-u`**, so every snapshot re-baselined itself around the bug. **5 tests still
failed.** The paired assertions carry the guarantee on that path; the snapshot is
doing the job it is supposed to do (catching drift), not the job it must not
(being the only guarantee).

Script: `snapshot-pairing.mjs` in this change directory.

---

## 2. The differentials, sampled directly

The project's post-C safety argument is *"a refactor that changes a solver's
verdict changes which boards exist"*. Sampled by hand-injecting solver bugs and
running only that game's differential:

| Injected defect | Ran against | Verdict |
| --- | --- | --- |
| `clusters/solver.ts` `solverTry`: drop the `ret++` progress count | clusters differential | **caught** (12 failed) |
| `clusters/solver.ts` `solverRecurse`: skip every 7th cell — a strictly *weaker* solver | clusters differential | **caught** (5 failed) |
| `engine/wires.ts` `xydCmp`: order by `y` then `x` instead of `x` then `y` | net + netslide differentials | **caught** |

The second is the interesting one: a solver that is merely weaker, not wrong,
still moves the fixture, because the generator is solver-gated at every step. The
argument holds where it was sampled.

The third matters for a different reason — see §5. `wires.ts` is a 413-line
shared module with **no test file of its own**, and a one-token change to its
comparator (which decides the RNG draw order through the spanning-tree grower)
was caught anyway, by two games' frozen fixtures. Absence of a local test is not
absence of coverage.

---

## 3. The one place the argument does NOT hold, found before Stryker ran

`engine/deduction-fixpoint.ts`, `grade = Math.max(grade, r)` → `grade = r`.

This is not a cosmetic mutation. The ladder restarts from rung 0 after every
firing, so a hard rung firing can unlock easy ones; without the `max`, the
reported grade is *the last rung that fired*, not the highest. That is the
difficulty grade a solver-gated generator accepts a board on.

- Against **`deduction-fixpoint.test.ts` alone — SURVIVED.** The module's own
  tests do not pin its central semantics. The existing
  `"tracks the highest rung that fired as the grade"` test fires the hard rung
  *last*, with nothing after it, so `grade = r` scores it identically.
- Against **`latin.test.ts` + all four other consumers' directories** (filling,
  undead, magnets, pattern — **including their frozen differentials**) —
  **SURVIVED**, 159 tests green.
- Against the **full suite — killed**, 65 failures across 11 files: the
  differentials, main tests and hint tests of `keen`, `towers`, `unequal` and
  `group`.

**Why those eleven and not the other four**, because the distinction is what
makes this a real finding rather than an indictment of four innocent games:
`latin.ts` is the **only consumer that reads `grade` at all**. Filling, Undead,
Magnets and Pattern destructure `{ impossible }` and nothing else, so the
mutation is *unobservable* through them — their staying green is correct.

So the precise statement is: **one semantic, with exactly one consumer, pinned by
eleven test files two layers away and by none of its own.** The guarantee is real
but it lives far from the code it protects. That is adequate as *coverage* and
poor as *feedback* — a targeted run during engine work ("I only touched the
fixpoint runner, let me run its tests") is systematically misleading, and that is
exactly the workflow the repo's own test-run economy encourages.

**Acted on** (task 2.1a): `deduction-fixpoint.test.ts` gained two assertions —
the grade must not regress when a hard rung unlocks an easier one (the shape the
existing test could not see, and the *normal* shape, since the ladder restarts
from the top after every firing), and `baseGrade` is a floor rather than a
no-rung-fired default. The mutant that previously needed the full 116-second
suite to die now dies in **116 ms**.

---

## 4. Mutation run over the engine

Scope: the seven modules the proposal named — `midend.ts`, `save.ts`, `latin.ts`,
`deduction-fixpoint.ts`, `border-grid.ts`, `dsf.ts`, `grid.ts`. **2,168 mutants.**

### 4a. What running it cost, and the one setting that decides feasibility

Three facts about this suite, none of them guessable in advance:

1. **Stryker's vitest runner forces `pool: "threads"`, `maxThreads: 1`,
   `maxWorkers: 1`.** The suite runs *serially*: the dry run executed **4,466
   tests in 20 minutes 54 seconds** (vitest's own parallel run of the whole suite
   is ~116 s). The default `dryRunTimeoutMinutes: 5` therefore cannot work here
   and was raised to 45.
2. **`coverageAnalysis: "perTest"` is load-bearing, not an optimisation.**
   Without it every mutant re-runs everything.
3. **And it does not help 39% of the mutants.** Stryker classified **836 of the
   2,168 (39%) as *static*** — mutants in code that executes at **module load**
   (top-level tables, constant initialisers, class field defaults) rather than
   inside a function a test calls. Per-test coverage cannot be attributed to
   those, so each needs a **full suite run**. Stryker's own estimate: they are
   **97% of the total time**. The observed ETA with them included was
   **~678 hours**; the non-static mutants ran at roughly 90 per minute.

**This is the transferable engineering result, and it is about the interaction
rather than either tool:** mutation testing is affordable on this codebase for
code inside functions and unaffordable for code at module scope, because the cost
of a static mutant is one whole serial suite run and this suite takes 21 minutes
serially. It is not that Stryker suits the codebase badly; it is that
`ignoreStatic` is the difference between 20 minutes and a month.

**`ignoreStatic: true` was set — and it turned out to skip almost nothing, which
corrects a claim this document made emphatically.** The completed report says:

| | static | dynamic |
| --- | --- | --- |
| Killed | 513 | 924 |
| Survived | 89 | 242 |
| Timeout | 228 | 118 |
| Ignored | **5** | 0 |

**831 of the 836 static mutants were evaluated.** Only five were ignored — all
`ArrowFunction` mutants in `border-grid.ts`, the ones Stryker could attribute no
per-test coverage to at all. `ignoreStatic` skips a static mutant only when it
*must* fall back to a whole-suite run; a static mutant that tests genuinely reach
still runs against them.

So the "836 mutants not evaluated" gap this section originally announced does not
exist: the real gap is **five**. That was worth catching. An overstated caveat
misleads exactly as much as a missing one — it would have understated this
audit's coverage by two orders of magnitude, and it survived being written into
the config's doc comment, this file and the task list before the completed report
contradicted it.

The 678-hour figure was real but was Stryker's *plan*, not its outcome: with
`ignoreStatic` on it stopped budgeting a full suite run for every static mutant
and the same set finished in 398 minutes.

---

### 4b. The result: where the killing power actually lives

| module | killed | survived | no-cov | timeout | total | **killed by its own test file** |
| --- | --- | --- | --- | --- | --- | --- |
| `border-grid.ts` | 168 | 51 | 0 | 35 | 259 | **150/168 (89%)** |
| `deduction-fixpoint.ts` | 27 | **0** | 0 | 7 | 34 | 19/27 (70%) |
| `dsf.ts` | 24 | 11 | 0 | 30 | 65 | 14/24 (58%) |
| `midend.ts` | 531 | 122 | 41 | 47 | 741 | 208/531 (39%) |
| `save.ts` | 54 | 30 | 1 | 0 | 85 | 8/54 (15%) |
| `grid.ts` | 40 | **0** | 0 | 0 | 40 | **1/40 (3%)** |
| `latin.ts` | 593 | 117 | 6 | 227 | 944 | **9/593 (2%)** |

**The last column is the transferable result, and it is §3's finding measured
across the whole engine rather than inferred from one case.** For `latin.ts` and
`grid.ts` essentially *all* the killing power is in distant game tests — 9 of 593
and 1 of 40. Neither is under-protected: `grid.ts` has **zero** survivors and
`latin.ts` 117 of 944. What they have is almost no *local* feedback, so during
engine work the repository's own test-run economy points at the files least able
to tell you anything.

`deduction-fixpoint.ts` is the counter-example and the encouraging one: **0
survivors**, 70% killed locally — after this change added two assertions to it in
§3.

### 4c. Triage of the 331 survivors

**(a) missing assertion → written.** `save.ts`, 30 survivors of 85 — the worst
rate in the run, and all inside `isSaveEnvelope`. The suite's only malformed
input was `{"hello":1}`, which fails the *first* check and short-circuits, so
nine field guards were executed by the happy path and never asserted to reject
anything; each could be `true` with the suite green. Line coverage cannot see
this, which is the question mutation testing exists to ask. 18 cases added, all
ten guard mutations re-run by hand and now failing. This is the one that mattered
most beyond the score: the guard stands between a corrupt save and a game state
rebuilt from nonsense.

**(b) genuinely unreachable → recorded, not deleted.** 48 `NoCoverage` mutants,
41 of them in `midend.ts`, over 31 distinct statements: `catch` arms
(`Invalid parameters`, `Could not read save`, `Invalid saved parameters`), the
"this game does not support solving/hints" refusals, and adapter-facing methods
no test calls (`getColourPalette`, `darkPalette`, `preferredSize`, `delete`).
**Checked against `tighten-type-checking`'s finding first**, which proved all 53
of its "unreachable" branches live — these are different: they are reachable and
simply unexercised, so the action is a test, not a deletion.

**(c) equivalent → the rest, and they are not triaged individually.** The
remaining ~250 survivors cluster hard by mutator, which is how they should be
read: `ConditionalExpression` 52 in `midend.ts` and 41 in `latin.ts`,
`BooleanLiteral` 22 in `midend.ts`, `ArithmeticOperator` 19 in `border-grid.ts`.
That shape — conditionals and boolean literals in orchestration and solver
plumbing — is where behaviour-preserving mutants concentrate. Walking 250
individually would be the score-chasing this change forbids; the follow-up takes
them by cluster.

**Not triaged, and it affects the cost story rather than the result: 346
timeouts (16%)**, 227 of them in `latin.ts`. Stryker counts a timeout as killed,
so the outcome is unaffected — but whether these are genuine non-termination or
contention artefacts decides whether a large part of the 398 minutes was wasted.
The report records the status, not the cause.

---

## 5. Engine modules with no test file of their own

Static, total, instant — and worth stating precisely rather than as a count,
because the raw number invites the phantom-finding mistake of §0. **18 of ~90
engine modules have no `<name>.test.ts`.** They are not one thing:

- **Nothing to test** — `game.ts` and `index.ts` (types and re-exports),
  `fake-game.ts` (itself a test double).
- **Data tables, tested through their consumers' snapshots** — `palette-games.ts`
  (reached by `palette.test.ts` and the colour scripts), `hint-vocab.ts`,
  `colour-token.ts`.
- **Real logic, covered only distantly.** `wires.ts` (413 lines, 9 importers),
  `divvy.ts` (231), `symmetric-blacks.ts` (151), `grid-core.ts` (11 importers),
  `grid-geometry.ts`, the three `grid-tilings-*.ts`, `deduction-record.ts`,
  `registry.ts`, `pencil-indicator.ts`. Each is reached by game tests and, for
  most, by a frozen differential — the `wires.ts` probe above confirms the
  coverage is real.

So this is not a coverage hole. It is the **feedback** shape of §3 again, and at
the size (`wires.ts` is bigger than five of the seven modules this audit
mutated) it is where a local test would pay for itself first.

**Acted on for the two largest.** `wires.ts` (413 lines, 9 importers) gained 25
tests and `symmetric-blacks.ts` (151 lines, 7 importers) gained 15, each stating
the rules the module's own doc comment claims and each mutation-checked against
the line it covers. Two things that came out of doing it, both worth more than
the tests themselves:

- **Writing a test is not the same as the test working.** `wires.test.ts`'s
  "needs the connection from BOTH sides" passed with the both-sides check
  *deleted*, because the case it happened to choose was one an unrelated guard
  already caught. Only breaking the line revealed that.
- **The division of labour between a local test and a differential can be
  checked, and should be.** In `symmetric-blacks.ts`, mutating
  `if (!rotate) rw += wodd` changes the 4-fold region size on an odd-width board
  — so it changes *which boards exist* without breaking any symmetry, and it
  survives every local test by design. Light Up's and Sticks' differentials fail
  on it. That is the correct place for it to be caught, and the test file now
  says so, having verified it rather than asserting it.

`divvy.ts` (231 lines, reached by Solo's jigsaw blocks, Palisade's regions and
Separate's partition) followed, with 14 tests stating the contract its three
callers rely on — every cell in exactly one region, every region exactly `k`
cells and 4-connected — plus a check that the output actually varies with the
seed, since a degenerate implementation that always cut the board into rows would
satisfy every structural assertion. Also measured rather than assumed: its
**retry loop never iterates** for any shape tested (0 retries over every case and
25 sweep seeds), so a mutant planted after the first attempt survives *correctly*
and the test file says so. Distinguishing "not covered" from "not reachable" is
the whole of triage class (b).

### 5a. The list above was measured with the wrong unit — corrected

"Has no file named `<module>.test.ts`" is **not** "has no local test", and
believing it nearly bought a redundant `grid-core.test.ts`. Re-measured by asking
which test files *import* each module:

| module | direct test importer |
| --- | --- |
| `grid-core.ts` | `grid-trim.test.ts` (+ `grid.test.ts` exercises `gridNewSquare` through the barrel it documents as the entry point) |
| `grid-geometry.ts` | `grid-incentre.test.ts` |
| `grid-tilings.ts` | `grid-desc.test.ts`, `grid-trim.test.ts` |
| `registry.ts` | seven test files |
| `colour-token.ts` | `colours.test.ts`, `palette.test.ts` |
| `palette-games.ts` | `palette-source.test.ts` |

So most of §5's list was already covered locally, by a test named after the
*barrel* or the *behaviour* rather than the file. **This is the fourth instance
this session of an instrument's unit being part of its correctness** — and the
first where the wrong unit would have caused work rather than a false alarm.

Genuinely reached by no test at all: `grid-tilings-{basic,hex,dodec}.ts` (only
through the tested `grid-tilings.ts`), `deduction-record.ts`, `hint-vocab.ts`,
`pencil-indicator.ts` — all small, and the first group is covered by
`grid-differential.test.ts` end to end.

The three files written above were still the right three, but for a sharper
reason than the heuristic gave:

- `wires.ts` — no importer of any kind in a test. Correct as stated.
- `divvy.ts` — `palisade.test.ts` imported it, but tested only sizes and region
  counts, never **connectivity**, and did it from a game's test file for an
  engine module with three consumers. The engine test now owns it (absorbing
  Palisade's shapes and its successive-draws-from-one-RNG case) and that block is
  deleted, so there is one place to update rather than two.
- `symmetric-blacks.ts` — `sticks.test.ts` imported only the `SYMM_*`
  *constants*; `placeSymmetricBlacks` itself had no direct test. And the proof
  that the distant coverage was insufficient is not an argument but a
  measurement: two of the five mutation probes found real gaps.

---

---

## 6. What persists, and what this cost

### The decision (task 4.1)

**Keep the config; do not fold it into `metrics.sh`; do not gate; do not ratchet.**

`scripts/stryker.config.mjs` stays, authored rather than JSON so the three
settings that decide feasibility carry their reasons — and they are the whole
value of keeping it, because each was measured rather than guessed and each is
the difference between "runs" and "does not". `npm run mutation` is its entry
point. It is **not** folded into `npm run metrics`: that harness finishes in a
couple of minutes and this takes hours, and silently making it forty times
slower would get it stopped rather than read.

No ratchet, and none is possible by construction — `thresholds.break` is `null`
and the score is recorded nowhere as a target. A number that invites maximising
invites tests written against mutants rather than against behaviour.

### The recommendation this audit ends with, which is not the one it started with

**The cheap instruments outperformed the expensive one, per unit of effort, by a
wide margin — and that ordering should shape what gets done next.**

Of the five substantive results here, the mutation run produced one (§4). The
other four came from: the sanity check the change *mandated before trusting the
harness* (§3 — the audit's sharpest finding, five minutes of work); a 60-line
script (§1); hand-injected probes against the differentials (§2); and a
filename sweep that then had to be corrected (§5, §5a).

That is not an argument against mutation testing — §4's systematic coverage is
the only reason "nothing else survives in these modules" can be said at all, and
no cheap instrument could have said it. It is an argument about **order**: run
the cheap instruments first, act on them, and reach for the expensive one to
close the remaining question rather than to open it.

### The cost, stated plainly

Four attempts were needed, and the reasons are worth recording because they are
all properties of *this* codebase meeting *this* tool:

1. A dry run that must execute the suite **serially** (Stryker forces
   `maxWorkers: 1`), so the default 5-minute timeout cannot work.
2. **39% of mutants are static** (module-scope), each costing a whole suite run
   — 97% of the estimated time, an observed ETA of ~678 hours. Skipped, and
   reported as skipped.
3. Contention: an identical dry run took **19 min 11 s** while other work ran and
   **7 min 34 s** after `right-size-the-test-gate` cut the suite. Mutation-testing
   cost is *derived* from suite cost, twice — once for the dry run and once per
   mutant.
4. **Cost per mutant is the size of its covering set**, which is why `midend.ts`
   dominates: nearly every test in the collection constructs a `Midend`, so its
   covering set is essentially the whole suite.

**The transferable rule, before reaching for mutation testing anywhere else:**
its affordability is decided by how much of the target is module-scope code,
multiplied by how slow the suite is with parallelism switched off, multiplied by
how broad the target's covering set is. None of those three is visible from the
line count of the module you want to mutate.
