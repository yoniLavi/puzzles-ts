# strengthen-engine-test-feedback — findings

**The change's own premise was the first thing it disproved.** The proposal was
built on a column from `audit-test-suite-strength` — "killed by its own test
file" — and scoped as *"the two extremes, `grid.ts` and `latin.ts`, first."*
Checking the instrument before trusting it, which is this repository's standing
rule and the audit's own most-repeated lesson, showed the column measures
something else. Corrected, `grid.ts` needed nothing at all and the worst module
was `midend.ts`, which the artefact had rated comfortably mid-table.

Section map: §1 the correction; §2 the instrument that replaced it; §3 the
results; §4 what was left equivalent; §5 the timeout question; §6 cost;
§7 one defect the whole gate was blind to.

---

## 1. The metric was file execution order

Stryker's `killedBy` names **the test that killed the mutant**, singular, because
the runner **bails on the first failure**. The evidence is in the report itself:
of 2,168 mutants, **1,437 killed, and every one has exactly one entry** —

```
{ multi: 0, one: 1437, zero: 731 }
```

So "killed by its own test file" is "its own test file happened to run before
every other covering test". Vitest orders files roughly alphabetically, and
`grid.ts`'s mutants are killed by `grid-aperiodic-differential.test.ts`,
`grid-desc.test.ts` and `grid-incentre.test.ts` — three siblings that all sort
ahead of `grid.test.ts`.

Confirmed directly rather than argued: deleting the `case "cairo":` arm from
`gridNew` and running **`grid.test.ts` alone** fails **nine tests in 1.5 s**.

The correction reverses the ranking the change was scoped around:

| module | audit's column | measured |
| --- | --- | --- |
| `grid.ts` | 1/40 (3%) — *second worst* | **6/6 (100%)** |
| `latin.ts` | 9/593 (2%) — *worst* | 5/15 (33%) |
| `midend.ts` | 208/531 (39%) — *mid-table* | **7/17 (41%)**, and the largest absolute gap |
| `save.ts` | 8/54 (15%) | 5/5 (100%) — the audit had already fixed it |
| `deduction-fixpoint.ts` | 19/27 (70%) | 7/7 (100%) — ditto |
| `border-grid.ts` | 150/168 (89%) — *best* | 5/7 (71%) |

Two of those rows are a **control group**: `save.ts` and `deduction-fixpoint.ts`
are modules the audit wrote local tests for, and they score 100%. So the new
instrument agrees with the audit where the audit *acted*, and disagrees where it
only *measured*. That is the right shape for a correction to have.

**`latin.ts` was a real finding all along** — 854 lines, eleven consuming games,
four local tests — but for a reason the number did not carry, and the number
would equally have sent the work to `grid.ts`, where there was nothing to do.

---

## 2. `npm run probe` — the instrument

`scripts/feedback-probe.mjs` + `scripts/feedback-probe-cases.mjs`. 72 hand-chosen
real defects across ten engine modules, each applied to the source with **only
the module's own tests** run against it.

Hand-chosen rather than replayed from the mutation report for two reasons: the
committed report is slimmed (no columns, no end offsets) so its mutants cannot be
spliced back precisely — an attempt to build that harness is what surfaced §1 —
and a curated case carries *why it matters*, which `ConditionalExpression →
false` cannot. Every case's `why` names the defect in the module's own
vocabulary: *"a placed digit is no longer ruled out of the rest of its column"*.

Four properties earned their place:

1. **A missing or non-unique anchor aborts the whole run**, before any test
   executes. It fired on the **first** invocation (`Invalid parameters:` appears
   twice in `midend.ts`) and twice more after. Each would otherwise have been a
   clean `SURVIVED` — the exact false result the audit produced twice.
2. **"Own tests" is derived, never hand-listed**: every engine test file that
   imports the module. Hand-naming `<module>.test.ts` is the audit's §5a unit
   mistake in the mirror direction — `midend.test.ts` alone omits save/load
   (`save.test.ts`), prefs (`midend-prefs.test.ts`) and desc supersession, eight
   files in all, and would have reported a filing convention as a feedback hole.
3. **`*-differential.test.ts` is excluded even when engine-local**, so a module
   cannot score full marks on assertions it does not make.
4. **`equivalent: true` cases carry their argument** and are excluded from the
   rate rather than counted against it — and the harness flags one that starts
   being *caught*, which means the argument has expired under a code change.

---

## 3. Results: 62% → 100%

| module | before | after | what was missing |
| --- | --- | --- | --- |
| `latin.ts` | 5/15 (33%) | **14/14** | every deduction, untested individually |
| `midend.ts` | 7/17 (41%) | **20/20** | the refusals a player reads; the timed clock |
| `wires.ts` | 2/4 (50%) | **4/4** | `growSpanningTree` had no local test at all |
| `dsf.ts` | 3/5 (60%) | **5/5** | one whole branch of union-by-size |
| `border-grid.ts` | 5/7 (71%) | **6/6** | the cursor clamp on the *x* axis |
| `grid.ts` | 6/6 | 6/6 | — |
| `save.ts` | 5/5 | 5/5 | — |
| `deduction-fixpoint.ts` | 7/7 | 7/7 | — |
| `divvy.ts` | 2/2 | 2/2 | — |
| `symmetric-blacks.ts` | 1/1 | 1/1 | — |
| **total** | **43/69 (62%)** | **70/70 (100%)** | 2 cases reclassified equivalent |

The `midend.ts` row gained three cases after the baseline —
`getColourPalette`, `darkPalette` and `delete`, the adapter-facing methods of
task 2.2 — so its honest before-figure is **7/20**, not 7/17: all three had no
test of any kind. They were added late because the first draft of task 2.2
*claimed* `worker-adapter.test.ts` reached them. It does not; it forwards to
them. Grepping rather than believing the note is what caught it.

**`dsf.ts` is the one worth reading twice**, because it shows how coverage and
feedback come apart in a file that looks thoroughly tested. `dsf.test.ts` *does*
assert `size()` and *does* cross-check against a brute-force reference over 200
random merges. But every merge in the hand-written tests joins **equal-sized**
classes, so `if (classSize[ra] > classSize[rb])` is never taken, and the
brute-force check compares class *membership* rather than roots or sizes. Both
halves of the union-by-size rule were unasserted. That is not a detail: `merge`'s
own doc comment records that upstream algorithms branch on the canonical root's
**identity** (Filling's `learn_critical_square` walks a region from its canonical
cell), so it is required for differential parity, not just connectivity.

**`midend.ts`'s gap was mostly sentences a player reads.** `loadGame` has four
distinct refusals and only the puzzle-id one was covered — the difference between
"this file is not a save" and "this save is for Galaxies" is the difference
between a corrupt file and the wrong one, and only one is worth retrying. Same
for `newGameFromId` (four ways a shared link can be wrong; two tested) and for
"This game does not support solving / hints", where answering `undefined` means
*done* and would tell the player it worked.

**`latin.ts`'s tests now read as Latin-square reasoning**, which is the point
rather than a flourish: `elim` places on a last remaining candidate and reports a
contradiction on none; `set` refuses three cells sharing two digits; `forcing`
follows a chain of two-candidate cells to an elimination. That is the same
reasoning a hint narrates. `matching` also gained tests — maximum cardinality
against brute force over 40 random bipartite graphs — because "is there a perfect
matching?" is Tents' completion check and is only answerable if the cardinality
is genuinely maximum.

### The boundary with the differentials, verified

`repo-layout` requires the division of labour to be checked rather than stated.
Disabling `matching`'s DFS adjacency swap (`if (rs && adjsizes[L] - j > 1)` →
`false`) changes the RNG draw order and therefore every generated board:

- `latin.test.ts` — **all 21 green**
- `towers-differential.test.ts` + `singles-differential.test.ts` — **34 failed**

A matching's cardinality is order-independent, so the local tests are blind to it
*by construction* and right to be. `latin.test.ts` now records this, with the
numbers, and says not to add a test that pins a particular matching.

---

## 4. What was left equivalent, and why (task 5.2)

Two cases were argued behaviour-preserving rather than chased. Chasing them would
have produced tests asserting a mechanism instead of a claim.

- **`latin.ts` — `row`/`col` placement ledgers.** Read in exactly one place:
  `diffSimple`'s `if (!this.row[...])` guard, which *skips* an `elim` sweep over a
  line whose digit is already placed. Run anyway, that sweep finds `m === 1` at
  the placed cell, sees `grid[y*o+x]` already set, and returns 0. The ledger is a
  scan-skipping optimisation with no observable behaviour of its own.
- **`border-grid.ts` — `if (dir === 4) return null`.** Unreachable. The three
  masks are not independent: the first leaves one of {L,R}, the second one of
  {U,D}, and the third clears exactly one of those two pairs, so one bit always
  survives.

**The second one paid for the analysis anyway.** Its comment said the guard
existed because "the click was on a corner/centre and means nothing" — which the
module's *own* test `"breaks the tie toward the down edge at an exact tile
centre"` already contradicted. The comment is now correct and says the exit is
defensive. Working out why a mutant is equivalent is worth doing even when no
test comes out of it.

---

## 5. The timeout question (task 3), answered from the existing report

346 mutants (16%) timed out, 227 in `latin.ts`. Stryker scores a timeout as
killed, so the result is unaffected; the question was whether ~400 minutes went
on genuine non-termination or on contention. No re-run was needed:

| module | timeout rate | loops per 100 lines | covering set |
| --- | --- | --- | --- |
| `dsf.ts` | **46%** | 3.1 | tiny |
| `latin.ts` | 24% | **7.5** | the latin games |
| `deduction-fixpoint.ts` | 21% | 1.4 | five consumers |
| `border-grid.ts` | 14% | 1.5 | two games |
| `midend.ts` | 6% | 0.8 | ~the whole suite |
| `save.ts` | **0%** | **0** | small |
| `grid.ts` | **0%** | **0** | grid tests |

**Genuine non-termination.** The two modules with no loop at all had **zero**
timeouts across 125 mutants — a type guard and a switch cannot fail to terminate
however loaded the box is. And the rate runs *inversely* to covering-set size:
`midend.ts` is slowest per mutant and times out least, which is the opposite of
what contention predicts. The mutator mix agrees: `UpdateOperator` (50) and
`BlockStatement` (31) are 36% of `latin.ts`'s timeouts and are definitionally
non-terminating inside a hand-rolled `while`.

**Consequence for a re-run:** budget the same ~400 minutes; a quieter box will
not help. The only lever is `timeoutMS`, and lowering it trades information (a
slow survivor misreported as killed) for time.

---

## 6. Cost (task 4.3)

**The gate**, in CPU time as `build-pipeline` requires — measured with
`/usr/bin/time -l` on the same box, back to back, with `git stash` as the only
difference:

| | tests | user CPU | wall |
| --- | --- | --- | --- |
| before | 6,555 | 170.41 s | 33.96 s |
| after | 6,604 | **175.30 s** | 33.82 s |

**+49 tests for +4.9 s CPU (+2.9%), and no wall-clock change at all** — the suite
runs in parallel and the additions land on files that were never the critical
path. Two of the 49 are the control-character sweep (§7); the other 47 are tier-1
arithmetic against a fake game and a 4×4 candidate cube, the largest being
`matching` against brute force over 40 four-by-four bipartite graphs. At ~3% on
two runs of a shared box this is close to the noise floor, and it is quoted as
measured rather than rounded to "free".

**The instrument.** `npm run probe` is ~15 minutes for all 69 cases, because each
case is a full vitest process launch against the module's own test files;
`--verify` is ~0.2 s and is what a reader runs after touching these modules.
Deliberately **not** in the gate and **not** folded into `npm run metrics`, for
the reason the mutation config already states: a harness forty times slower than
the one it joins gets stopped rather than read.

**The re-measurement (task 4.1) was done with `npm run probe`, not Stryker.**
A ~7-hour re-run would re-measure the metric §1 disproved. The probe measures the
property the requirement actually states, in 15 minutes, and is committed so the
next reader can repeat it instead of trusting this table.

---

## 7. One defect the whole gate was blind to, found by accident

Writing the "data that is not JSON at all" case above put a **literal NUL byte**
into `save.test.ts`. Every instrument in the gate passed it:

- `tsc -b --noEmit` — a NUL inside a string literal is legal TypeScript
- `biome check` — formatted the file and reported nothing
- `vitest` — the test went **green**, because a NUL encodes to a byte that is
  not JSON, which is exactly what the test wanted
- `vite build` — built

The only signal was `git diff --stat` printing `save.test.ts | Bin 6264 -> 9595
bytes`. **Git treats a file containing NUL as binary and stops diffing it**, so
the file's changes silently become unreviewable — a much worse outcome than the
byte itself, and one that would have been discovered at review time or never.

Guarded now in `src/asset-integrity.test.ts`, which already exists for exactly
this class ("invisible to every other instrument, so assert it statically"): no
`.ts` file under `src/` may contain a raw C0 control character, TAB/LF/CR
excepted. The failure names the file, the codepoint and the offset. Verified to
discriminate by planting a NUL in `pointer.ts`.

Two things worth carrying forward. **A check cannot contain a literal instance
of what it forbids** — the first draft used a character class and failed its own
file; escaping it then tripped biome's `noControlCharactersInRegex`, so it is a
codepoint scan, which sidesteps both with no suppression to explain away later.
And **"the test passed" is not evidence the test file is well-formed**: the
assertion and the committed artefact are different things, and only the second
one is what everyone else reads.
