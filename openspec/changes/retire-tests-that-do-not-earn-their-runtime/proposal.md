# retire-tests-that-do-not-earn-their-runtime

Realizes the owner directive of 2026-09-08, now in `AGENTS.md` § "Test
discipline": *"I'm happy to retire any tests that aren't that useful for
regression testing any more; many of these were just for the porting from C …
remove any tests (particularly slow ones) that are costly for no good benefit."*

**Readiness: NOT ready — task 0 is the measurement, and this change must not
delete anything before it exists.** The one way to get this wrong is to retire
by category ("it was a porting test") rather than by evidence, and the category
is exactly where the strongest tests in the repo also live.

## Why

**The port is over and the suite still costs what a port cost.** The gate runs
301 files and ~8,500 tests; a full `npm run gate` is ~3 minutes wall and 13–18
minutes of CPU, paid on every commit. A large share of that was written to prove
a C translation faithful — a job that finished, and that no longer maps onto
"would this catch a regression in the refactoring we are doing now?"

**But the obvious cut is the wrong one, and the repo already says so.**
`engine/testing/differential.ts`'s own header makes the case *against* the
retirement this change is named for:

> What a fixture still does, and why they are all kept, is act as the net under
> refactoring: a change that alters a solver's verdict alters which boards exist,
> which is exactly what these catch.

That is not special pleading — it is the reason byte-parity was such a good deal
in the first place: **one byte-match assertion validates generator, solver and
codec together.** 59 test files carry `c-reference` fixtures. Deleting them
wholesale would remove the strongest net under precisely the solver and generator
refactoring the framework work involves, which is the opposite of what the
directive asks for.

**So the unit of decision is the fixture, not the category**, and the question is
the one `docs/test-strength.md` already asks: *would this have told me?* A test
earns its runtime when it would catch something in a refactor that **no cheaper
test would**. Three shapes plainly fail that and are what this change is hunting:

1. **The largest board of a family whose every mode, tier and grid type is
   already covered by smaller fixtures in the same file.** `testing/slow.ts` was
   built for exactly this and names the precedent — three Seismic 7×7 fixtures at
   272 s, one Bricks 12×8 at 100 s. What a bigger board adds is *size* against
   the same code paths.
2. **A slow tier nobody invokes.** Measured 2026-09-08 while writing
   `refuse-honestly-at-every-tier`: `hint-resume.test.ts` at five seeds × every
   preset ran **50 minutes without reporting**. That is not thoroughness, it is a
   check that will be skipped, and it was cut to two seeds in that change. Every
   other `describeSlow` deserves the same question asked out loud.
3. **A test whose only observer is the thing under test.** The repo has a name
   for this already (`ts-migration`, "a test whose only observer is the thing
   under test cannot establish ground truth") and the probe corpus is the
   instrument for finding more.

## What this change is

**A measurement, a classification, and only then a deletion.** It ends with per
file: the cost, what it uniquely protects, and keep / demote-to-slow / retire —
with the reason recorded at the site for anything demoted or removed, naming what
still covers the configuration.

## What it must not do

- **Touch the gate's composition.** `tsc` → biome → probe-anchor → spelling →
  `openspec validate` → `vitest run` → `vite build` stays exactly as it is. What
  is in scope is *what vitest runs*, never whether it runs, and never
  `--no-verify`.
- **Retire the last cover for a configuration.** A mode, grid type or difficulty
  that only one fixture reaches keeps that fixture however slow it is; the
  remaining coverage is stated at every site that changes.
- **Delete a differential because it is a differential.** Each is answered on
  what it would catch, and the expected outcome is that most are kept.
- **Ratchet.** The output is a decision per file, not a runtime budget somebody
  has to defend later. `docs/test-strength.md`'s standing rule — the probe and
  the metrics are diagnostics, never gates — applies to this measurement too.

## Impact

- Affected specs: `repo-layout` or `ts-migration` (the retirement bar, once
  task 0 says what it is). None until then.
- Affected code: test files and `__fixtures__` only. No production code.
- Owner acceptance: not required for the retirements themselves — the directive
  is the authorization. **Except** where a retirement would leave a game's
  generator or solver with no differential at all, which is a change to what the
  project can still prove about that game and is worth naming to the owner
  rather than deciding quietly.
