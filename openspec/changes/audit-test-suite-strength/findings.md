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

**So the run reported below sets `ignoreStatic: true`, and the 836 static mutants
were NOT evaluated.** Stating that is not a formality — a partial run reported as
complete is the "no silent caps" failure this project has named. What is missed is
specific and predictable: the module-scope constant tables (`grid.ts`'s tiling
tables, `latin.ts`'s difficulty constants and similar). Those are data, they are
read by every consumer of the module, and the differentials do pin them — but this
audit did not measure that, and says so.

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

---
