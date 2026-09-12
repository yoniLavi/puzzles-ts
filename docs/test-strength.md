# Assessing test strength

**How to find out whether a test would actually catch anything** — and how to
avoid being lied to by the tool you use to find out.

This is the companion to [`porting/game-port-playbook.md`](porting/game-port-playbook.md)
§5, which covers *writing* tests (the tiers, the render harness, keeping the gate
cheap). This one covers *assessing* them, which is a different activity and
applies to the whole tree, not just game ports.

Normative rules live in the specs — [`repo-layout`](../openspec/specs/repo-layout/spec.md)
("The test suite's strength is audited, not assumed"; "A shared module's tests
give feedback where the code lives") and
[`build-pipeline`](../openspec/specs/build-pipeline/spec.md) ("The commit gate's
cost is proportional to what it protects"). This is the followable *how*.

Provenance: everything below was measured, most of it in
`2026-08-02-audit-test-suite-strength` (2,168 mutants, 398 minutes),
`2026-08-02-strengthen-engine-test-feedback` (the local-feedback probe) and
`2026-08-01-right-size-the-test-gate`.

---

## 1. Three properties, routinely confused

| property | question | how you measure it |
| --- | --- | --- |
| **coverage** | is this line executed? | line coverage — and it is the least interesting |
| **strength** | would a wrong answer here be *noticed*? | mutation: change the line, see if anything fails |
| **feedback** | noticed **by what**, and how soon? | break the line, run *only* the module's own tests |

The collection is strong on the first two, and the third is the one worth
measuring deliberately — because this repository's test-run economy tells you to
run the files you touched and let the commit hook be the single full run. Applied
to a module whose local tests cannot see its defects, that advice returns green
on a broken module during exactly the refactoring the tests exist to make safe.

Measured with `npm run probe` (§2a), over 173 hand-chosen real defects across 18
modules — the first fourteen for **+49 tests and +4.9 s of gate CPU** with wall
clock unchanged, the four shared-machinery modules below for **+33 tests and
+1.2 s**:

| module | before | after |
| --- | --- | --- |
| `candidate-hint.ts` (13 importers) | 14/30 (47%) | 30/30 (100%) |
| `slide-planner.ts` | 12/20 (60%) | 18/18 (100%) |
| `loopgen.ts` | 7/12 (58%) | 10/10 (100%) |
| `grid-geometry.ts` | 9/18 (50%) | 14/14 (100%) |
| `latin.ts` | 5/15 (33%) | 14/14 (100%) |
| `midend.ts` | 7/20 (35%) | 20/20 (100%) |
| `wires.ts` | 2/4 (50%) | 4/4 (100%) |
| `dsf.ts` | 3/5 (60%) | 5/5 (100%) |
| `border-grid.ts` | 5/7 (71%) | 6/6 (100%) |
| `params.ts` (90 importers) | 3/6 (50%) | 6/6 (100%) |
| `grid-core.ts` | 2/4 (50%) | 4/4 (100%) |
| `color-mkhighlight.ts` (37) | 4/5 (80%) | 4/4 (100%) |
| `findloop.ts` | 5/6 (83%) | 6/6 (100%) |
| `grid.ts`, `save.ts`, `deduction-fixpoint.ts`, `divvy.ts`, `symmetric-blacks.ts` | 100% | 100% |

The "after" denominators shrink where a case was argued **equivalent** (§5) —
eight of them now — and, once, where a case was **removed for probing the wrong
layer**: two `loopgen.ts` cases changed *which* loop a seed produces, which is
Pearl's differential's guarantee and not a local test's (rule 2 of the corpus).
Neither shrink is a pass mark. What each one buys is a written argument, and the
harness re-checks every equivalent on every run: one that starts being *caught*
means the argument expired under a code change.

> ### The number this table replaced was an artifact — read §7 first
>
> The audit reported a **"killed by its own test file"** column from Stryker's
> `killedBy`, and it ranked `grid.ts` at 3% and `latin.ts` at 2%. Both were
> wrong, in opposite directions. **Stryker bails the test run on the first
> failure**: all 1,437 killed mutants in that report have exactly *one* entry in
> `killedBy`, so the column records which covering test happened to run **first**.
> Vitest orders files roughly alphabetically, so `grid.ts` scored 1/40 because
> `grid-aperiodic-differential.test.ts`, `grid-desc.test.ts` and
> `grid-incenter.test.ts` all sort ahead of `grid.test.ts`.
>
> Measured properly, `grid.ts` catches **6 of 6** — deleting its `case "cairo":`
> arm fails nine of its own tests in 1.5 s — and the genuinely worst module was
> `midend.ts`, which the artifact had rated *mid-table* at 39%. **The correction
> reversed the work order the change was scoped around.**

**So "well covered" is not the finish line. Ask where the failure would appear,
and how long after the mistake.**

---

## 2. The cheap probe — do this before reaching for any tool

Four of the five findings in the audit came from this, and it takes minutes. Full
mutation testing found one.

1. Pick the line that is the *point* of the code — the `Math.max`, the `<=`, the
   guard.
2. Break it.
3. Run the narrowest test set you would have trusted.
4. Widen until something fails. **Where it first fails is the finding.**

Worked example, and the audit's sharpest result:
`engine/deduction-fixpoint.ts`, `grade = Math.max(grade, r)` → `grade = r`.

- its own test file — **survived**
- `latin.test.ts` + all four other consumers' directories, differentials
  included — **survived**
- the full suite — killed, 65 failures in 11 files

The diagnosis is not "weak tests". `latin.ts` is the only consumer that *reads*
`grade`; the others destructure `{ impossible }`, so the mutation is unobservable
through them and their staying green is correct. One semantic, one consumer,
pinned by eleven files two layers away and by none of its own. Two local
assertions later it dies in 116 ms instead of needing a 116-second suite run.

**A scripted probe harness must fail loudly when its edit does not apply.** A
non-unique anchor string silently leaves the file untouched, the tests pass, and
the harness reports `SURVIVED` — a clean measurement of nothing. Two false
results were produced this way before the harness was fixed:

```sh
n=$(grep -c "$ANCHOR" "$FILE")
[ "$n" -eq 1 ] || { echo "EDIT NOT APPLIED ($n matches) — not a result"; exit 1; }
```

## 2a. `npm run probe` — the cheap probe, kept

The §2 loop, as a committed corpus rather than a thing you retype. Runner:
[`scripts/feedback-probe.mjs`](../scripts/feedback-probe.mjs); cases:
[`scripts/feedback-probe-cases.mjs`](../scripts/feedback-probe-cases.mjs).

```sh
npm run probe -- --verify        # every anchor still applies, ~0.2 s
npm run probe                    # all 174 cases, 30–45 min
npm run probe -- latin midend    # substring-filtered
```

**A case is anchored *within a named declaration*, not within its file.** Each
case carries `within` — the function, `Class.method`, class or module-level
constant it perturbs — and its `find` must match exactly once inside that
declaration's span, which
[`scripts/feedback-probe-locate.mjs`](../scripts/feedback-probe-locate.mjs)
finds without a parser (line-start shapes, then brace-matching with strings and
comments skipped). When you add a case, name the function it lives in; when a
refactor moves a probed line into a different function, the anchor check names
the declaration it looked in, and re-pointing `within` is the fix. A name
declared twice in the file — two classes with a `merge()` — must be qualified
(`Dsf.merge`); the locator aborts rather than choosing. Why the scope: with
file-wide uniqueness, a `Midend.snapshot()` that listed the same field names as
the save envelope blocked a commit that had not touched what either case
probed, and that collateral grows with exactly the refactoring `AGENTS.md`
asks for. The strictness did not change — only the search space did — and the
migration was checked by planting every case both ways and comparing the
sources byte for byte.

Each case is a **real defect with a sentence naming it** — not "conditional
flipped" but *"a placed digit is no longer ruled out of its column"* — applied to
the source, with only the module's own tests run against it. Four things it does
that the ad-hoc version does not:

- **Aborts if an anchor is missing or non-unique**, before running anything. This
  fired on the very first run (a `catch` arm duplicated in `midend.ts`) and twice
  more; each would otherwise have been a clean `SURVIVED` measuring nothing.
- **Derives "own tests" mechanically** — every engine test file that *imports* the
  module (**or a barrel re-exporting it**), minus the differentials. This one
  question has now been answered wrongly three times, each producing a different
  false picture: matched on filename (§7); taken as the single file named after
  the module, when eight drive a `Midend`; and taken as direct imports only, when
  `grid/index.ts`'s own doc comment says *"import from this module, not from the
  parts"* and `grid.test.ts` is therefore `grid-core.ts`'s real test surface.
- **Excludes `*-differential.test.ts` even when engine-local**, so a module cannot
  score full marks on assertions it does not make.
- **Carries `equivalent: true` cases with their argument**, excluded from the rate
  rather than counted against it — and flags one that starts being *caught*,
  which means the argument has expired under a code change.
- **Walks `src/engine/` recursively, and refuses to run below a committed floor
  on the number of test files it finds.** The walk was one level deep while the
  engine was flat; `group-crowded-source-directories` grouped `grid/` and
  `color/` into subdirectories, and a walk that had not followed them would
  simply have derived fewer own-tests — so more cases would report `SURVIVED` and
  **the rate would drop**, which reads as *"the tests got worse"* rather than
  *"the instrument stopped looking"*. The anchor check cannot cover it: anchors
  quote source **lines**, and a pure file move leaves every one of them valid.
  The floor lives in `--verify`, so it is in the commit gate.

It is a diagnostic, **never a gate and never ratcheted**, the same standing as
`npm run metrics` and `npm run mutation`. Adding a case is welcome; adding one
because a module scores badly is score-chasing.

**One half of it *is* gated, and only that half.** `--verify` runs in the
commit gate's fail-fast prefix (0.02 s), checking that every anchor still
**applies** — never what the probe would find. The corpus quotes engine source
verbatim, so a refactor of a probed line stops the case matching, and the
harness then measures a smaller corpus and *reports success*: a silent cap that
reads as health, on a diagnostic nobody runs for twenty minutes at a time. The
rate itself stays ungated, because a gated feedback number invites tests written
against the number. When it fails, re-anchor on surrounding text — and take the
prompt to decide whether the case still states the defect it claims to.

**A run restores only the module it currently has planted.** It used to put
*every* probed module back from the copy it read at start, in its `finally` —
which, forty minutes into a run, silently reverted a session's worth of edits
to a module the run had long finished with. Editing a not-yet-probed or
already-probed module during a run is now safe; the one module with a plant in
it is the one to leave alone (and `git diff src/engine` names it). `--verify`
during a run still reads the plant as an anchor mismatch on that module, for
the reason the next paragraph gives.

**Never run two probes at once, and read "anchor not found" with that in mind.**
A run *edits engine source in place* and restores it in a `finally` (and on
`SIGINT`), which is safe for one run and unsafe for two: the second reads its
baseline while the first has a defect planted, and then either restores the
mutation as if it were the original or reports an anchor missing from a line
that is sitting right there in git. Both happened here in one sitting — an
argument-less invocation (which means *all eighteen modules*, twenty minutes)
left running behind a filtered one. The tell is that the quoted anchor **does**
match the committed file: check `git diff` on the probed module before believing
the anchor drifted, because what you are looking at may be the other run's
planted defect. Being mid-edit makes this worse rather than better — anything
already `git add`ed stays staged while the working tree carries the plant.

---

## 3. Writing a test that discriminates

**A test passing on first write is not evidence it works.** Four real gaps were
found in this session's own new test files, each of which passed immediately:

- `wires.test.ts` — "needs the connection from BOTH sides" passed with the
  both-sides check *deleted*, because the case it chose was one an unrelated
  guard already caught. The discriminating case had to be a neighbor wired to
  *nothing*.
- `symmetric-blacks.test.ts` — the degree-2 region's `+ hodd` could be deleted
  with everything green (the mirror still mirrors; it just leaves the center row
  permanently white), and `<=` could become `<` unnoticed because the two differ
  only on the draw that *equals* `blackpc`.

So: **flip the line the test is for, watch it go red, put it back.** Seconds of
work, and the only thing separating an assertion from a decoration.

### An assertion whose two sides derive from the same value is a decoration

`grid.test.ts` asserted `expect(d.edges.length).toBe(d.order)` across all
eighteen tilings. It **cannot fail**: `d.edges` is allocated as
`new Array(d.order)`, so its length *is* `d.order` by construction. Halving every
dot's degree in the builder passed all 151 tests in the file.

The non-vacuous form is the one the code under test has to get right — here, a
dot's degree counted independently, as the number of edges naming it as an
endpoint. **Grep for the shape**: `x.length` compared against the thing that
sized `x`, a getter compared against the field it returns, a derived total
compared against the sum it was computed from. All of them read like strong
structural invariants and assert nothing.

A related trap sits one step further on: the first replacement asserted *no*
null faces and failed 28 tilings, because a boundary dot's face ring is legally
broken once by the infinite exterior. **When a real invariant turns out to have
an exception, bound the exception** ("at most one null, and only on the
boundary") rather than dropping the assertion — the bound is what catches the
anticlockwise walk giving up early.

### `toContain` of one character cannot distinguish it from a superstring

`abcd.test.ts` checked its ASCII board renderer with four assertions —
`toContain("A")`, `toContain(".")`, `toContain("-")`, `toContain("|")`. When
`retire-native-directory`'s bulk rewriter turned the empty-cell character from
`"."` into `"./"`, **every cell in the board rendered wrong and all 28 tests in
the file stayed green**, because a string containing `"./"` contains `"."`.
Re-verified 2026-08-03 by planting the same edit.

The trap is not "`toContain` is weak"; it is that a one-character needle admits
every string that merely *contains* that character, and the corruptions that
actually happen — a stray suffix, a doubled glyph, a wrong-width pad — are
exactly superstrings. The same applies to a short needle in a small alphabet:
`toContain("1")` is satisfied by `"11"` and by `"21"`.

**Two exemptions, and both narrow the trap to where it actually bites.**

1. **The negative form is *strengthened* by it, not weakened.**
   `not.toContain("x")` fails on the superstring too, so it needs no attention.
2. **`toContain` on an *array* is exact-element, not substring.**
   `expect(["11"]).toContain("1")` **fails**. So a render test collecting
   `ops.filter(o => o.op === "drawText").map(o => o.text)` and asserting
   `toContain("1")` is checking that some cell drew exactly `"1"` — precisely
   the right assertion, and not an instance of this trap at all. Check the
   receiver's *type* before "fixing" a site; four of eighteen candidates here
   were arrays (`twiddle-render`, `fifteen-render`).

So: the positive, **string** form. A grep of this repo returns twenty hits, of
which two are this trap being *described* in `abcd.test.ts`'s comment and four
are the array form — **fourteen** real ones, and only two of those were worth
changing. The test is not "is the needle short?" but **"is this the only
assertion of the rendering?"**:

- `sticks.test.ts` and `fifteen.test.ts` asserted a whole board a character at a
  time and nothing else. Both are now `toMatchInlineSnapshot`, each **verified to
  fail** on a planted corruption the old form let through (2026-08-03: sticks'
  blank cell `"."` → `"./"`, the original abcd edit; fifteen's tiles gaining a
  stray suffix, where `toContain("1")`, `toContain("3")` and a two-line count all
  still held).
- The other twelve sit beside an assertion that pins the thing down — an exact
  `lines[0]`, a `split("*").length` count, a `toMatch(/[><v^]/)`, a phrase in a
  hint explanation — or are smoke checks in a test about something else
  (`flip.test.ts`'s `toContain("+")` is verifying `loadGame`, not the text
  format). Rewriting those is churn: the enumeration is in
  `openspec/changes/archive/2026-08-02-close-bulk-edit-blind-spots/tasks.md` §4
  if a defect ever points at one.

For a text format, assert the **whole rendering** — `toMatchInlineSnapshot()`
fills itself in on first run, so there is nothing to transcribe by hand, and the
diff on failure shows the board. Pair it with the tier-2.5 rule: keep at least
one targeted assertion beside a snapshot so a careless `vitest -u` cannot erase
the guarantee.

One more thing the per-character form cannot do, found while replacing it:
**it cannot notice a character that is absent.** `sticks.test.ts` was called
"renders the four cell glyphs" and asserted three, because the fixture placed
only a vertical and `-` never appeared on the board. Asserting the whole
rendering makes the omission visible; the test now places both line types.

### A test whose every assertion is conditional says nothing when its case never arrives

The commonest of the three shapes above, and the only one now guarded:
`scripts/checks/vacuous-assertions.mjs` fails the gate on a test whose every
`expect` sits behind an `if` — counting `if (…) continue;` and `if (…) return;`,
which are the same guard written the other way round. The fix is always the
same: count what the condition matched and assert the count outside it, so a
fixture that stops producing the case fails instead of passing over nothing.

**What it is worth, measured rather than estimated** (2026-09-12,
`guard-tests-that-cannot-fail`). The thirteen tests `tidy-the-code-after-the-port`
strengthened are the regression corpus; running each candidate shape over every
one of those games' test files as they stood at the tidy commit's parent, and
again at the commit:

| shape | caught of 13 | sites at the time |
| --- | --- | --- |
| both sides of an assertion are one expression | 0 | 5, all sound |
| a bound the type guarantees (`>= 0`, one-char `toContain`) | 0 | 11, reviewed above |
| every assertion conditional | **5** | 53 |

So two of the three shapes were **not built**, and the numbers are the reason.
`expect(roots("same")).toBe(roots("same"))` is not a tautology — it is the
assertion that a seed determines a result, with `.not.toBe(roots("different"))`
on the next line — and all five of its hits are that. The proposal's estimate was
"perhaps half of the thirteen"; it is five, and the confidence ordering its
design gave the three shapes is exactly inverted. **The shape called "lowest
confidence as a defect" is the only one that catches anything.**

Two exemptions are derived from the syntax rather than ledgered: an `if`/`else`
that asserts on both branches always runs one of them, and a scan whose last
statement is a `throw` has written its own vacuity guard already. Widening the
key from `if` alone to `if` plus early-out took the catch rate from 4 to 5 and
the population from 24 to 53; widening it further to *loop bodies* reports
**301**, nearly all table-driven cases over a literal array that cannot be empty
— a wall, and a wall is a guard nobody keeps.

The guard proves itself on every run against seven fixtures, because a guard
about tests that cannot fail has no business being one.

### "The test passed" is not evidence the test *file* is well-formed

Writing a "feed `decodeSave` some garbage" case put a literal **NUL byte** into
`save.test.ts`. tsc compiled it, biome formatted it, the test went green, and
`vite build` built. The only signal was `git diff --stat` printing
`Bin 6264 -> 9595 bytes` — **git treats a file containing NUL as binary and stops
diffing it**, so the change silently became unreviewable, which is far worse than
the byte that caused it.

`src/asset-integrity.test.ts` now forbids raw C0 controls in any `.ts` file under
`src/`. Write deliberate garbage as escapes or a byte array
(`Uint8Array.from([0x53, 0x41, 0x00, 0xff])`), never as a literal. And note the
shape of the check itself: **it cannot contain a literal instance of what it
forbids**, so it is a codepoint comparison rather than a character class — the
regex form fails its own file, and escaping it trips
`noControlCharactersInRegex`.

### Short-circuits hide whole guards

`save.ts` had 30 of 85 mutants surviving, all in one type guard. The only
malformed input the suite fed it was `{"hello":1}` — which fails the **first**
check and short-circuits, so the other nine guards were executed by the happy
path and never asserted to reject anything. Each could be replaced with `true`
and the suite stayed green. Line coverage cannot see this: the lines run.

**For any validator, corrupt one field at a time**, and include a case asserting
the *valid* input still passes — otherwise every rejection case can pass for the
wrong reason.

---

## 4. The boundary with the differentials — state it, then verify it

Some guarantees genuinely belong to a game's frozen differential rather than a
local test: an RNG draw order, a region sizing that decides *which boards exist*.
Restating those locally is impossible to do better and pointless to do worse.

**But the boundary must be checked, not asserted.** Two worked examples, both
verified by running the differential against the mutation rather than reasoning
about it, and both recorded in the module's own test file so a later reader can
place a new case on the right side of the line:

- `symmetric-blacks.ts` — dropping the guard on `if (!rotate) rw += wodd` changes
  the 4-fold region size on an odd-width board, so it changes which boards exist
  without breaking any symmetry, and it survives every local test *by design*.
  Light Up's and Sticks' differentials fail on it.
- `latin.ts` — disabling `matching`'s DFS adjacency swap (`if (rs && …)` →
  `false`) changes the RNG draw order and therefore every generated board. All 21
  tests in `latin.test.ts` stay green; **34 assertions** fail across
  `towers-differential.test.ts` and `singles-differential.test.ts`. A matching's
  *cardinality* is order-independent, which is exactly why the local tests are
  blind to it and right to be — they assert maximality against brute force, and a
  test pinning a particular matching would break on any deliberate generator
  change while proving nothing new.

Conversely, when you extract logic into `src/engine/`, **write the tests
in the same change**. Extraction moves the code but not its tests: the game's
differential still catches defects, nothing turns red, and the module quietly
arrives with no local assertions. `wires.ts` (413 lines, nine importers) had none
at all.

### 4a. A frozen capture used as a *quality bar* is on the wrong side of the line

Everything above is about a fixture recording something **underivable** — which
board a solver-gated generator produces, an RNG stream, a tiling's incidence in
emission order. There the recording *is* the specification and no local test can
replace it.

A capture used instead as a **peer comparison** — "our answer is within a
tolerance of the other implementation's", for a quantity that has a definition
you could just compute — is not a differential in that sense, whatever it looks
like. It is green whenever both implementations are wrong in the same way, and
its tolerance is not tightenable, because the tolerance is there to absorb *the
peer's* error rather than yours.

`grid-incenter.test.ts` was the repo's one example and is now the worked one
(`retire-the-incentre-c-fixture`). It asserted `|r_TS − r_C| ≤ 1` over 1,864
faces against a frozen C capture. Replacing that with the largest circle the
integer lattice actually admits — computed from the vertex ring, sharing no line
with the implementation — found within minutes that the stored point used
upstream's `(int)(v + 0.5)`, which is round-to-nearest only for a *positive*
coordinate, while grid coordinates are negative over most of a board. Cost: up
to **1.229** units of inscribed radius, against **0.053** once rounded properly.
The C is wrong in the same direction, so every one of those 1,864 faces had
passed.

**The test to apply:** ask whether the quantity has an independent derivation.
If it does, compute it and delete the capture — that trades a fixture for a
*stronger* guarantee, not a weaker one. If it does not, the capture stays. And
when you delete one, account for every fact it carried, not just the headline:
this one also supplied the *list of cases swept*, which the replacement re-founds
on `ALL_GRID_TYPES` so a new tiling joins by existing rather than by someone
remembering.

---

## 5. Distinguish "not covered" from "not reachable"

A survivor has three explanations and they need different actions:

| class | action |
| --- | --- |
| **missing assertion** | write the test |
| **unreachable in practice** | record it; do **not** delete the code |
| **equivalent mutant** | record and move on |

`divvyRectangle`'s retry loop never iterates for any shape tested — instrumented,
0 retries across 25 sweep seeds — so a mutant planted after the first attempt
survives *correctly*. That is class two, and the test file says so.

Before calling anything dead, check it against `tighten-type-checking`'s finding:
that change proved **all 53** of its "unreachable" branches were in fact live and
the analysis wrong.

**Chasing an equivalent mutant is worse than leaving it**, because the test you
write to kill it asserts a mechanism rather than a claim. From the probe corpus,
each argued rather than assumed, and in three distinct flavors:

*Argued from the code.*

- `latin.ts`'s `row`/`col` ledgers are read in exactly one place — a guard that
  *skips* an `elim` sweep over a line whose digit is already placed. Run anyway,
  that sweep finds one candidate, sees the cell already filled, and returns 0. The
  ledger is a scan-skipping optimization with no behavior of its own.
- `border-grid.ts`'s `if (dir === 4) return null` is unreachable: the three masks
  are not independent, so exactly one edge bit always survives.
- `slide-planner.ts`'s default `isGoal` is consulted at two sites and both read
  `h === 0 || isGoal(board)`, so with a heuristic that is contractually zero at
  the goal it is never reached.
- `grid-geometry.ts`'s three singular-system guards (`disc >= 0`, two
  `det === 0`) turn a rejected subset into a `NaN` or infinite candidate point,
  and the point-in-polygon vetting answers false for both — which the module's
  own doc comment already says. They are an economy, not a correctness measure.

*Argued mathematically.* Ray casting counts crossings of the horizontal line
through the point, which a closed polygon crosses an even number of times — so
the crossings to the **left** and to the **right** have the same parity, and
`grid-geometry.ts`'s choice of direction cannot change an answer.

*Settled by measurement, because the argument would not close.* Two `loopgen.ts`
cases — admitting a zero-transition coloring, and stopping when either candidate
list empties rather than both — survive 1,319 (tiling, size, seed) runs across
all eleven periodic tilings with **byte-identical** colorings. The sweep's own
sensitivity was checked first: perturbing the random-flip pass moves 1,310 of
those 1,319 rows. Likewise `slide-planner.ts`'s "take the first meet in a level
rather than the cheapest" survives 601 scrambles checked against an independent
breadth-first search without once returning a non-shortest path. These stay in
the corpus **because** the argument is empirical: a tiling or move set that
exposed one would show up as an equivalent turning CAUGHT.

**And working out *why* a mutant is equivalent is worth doing even when nothing
changes** — `border-grid.ts`'s had a comment claiming it rejected corner and
center clicks, which the module's own tie-break-at-a-tile-center test already
contradicted. The comment is now right.

---

## 6. Full mutation testing — when it is worth it, and what it costs

`npm run mutation` (config: [`scripts/stryker.config.mjs`](../scripts/stryker.config.mjs),
which documents its own settings). Reach for it to *close* a question the cheap
probes have opened, not to open one. **It is an audit, never a gate, and its
score is never ratcheted** — a number that invites maximizing invites tests
written against mutants rather than against behavior.

**Cost model, measured:**

```
per mutant  =  one covering-test run              (normally)
            =  one WHOLE-SUITE run                (when coverage can't be attributed)
```

Affordability is therefore decided by three things, none visible from a module's
line count:

1. **How broad the target's covering set is.** `midend.ts` dominated the run
   because nearly every test in the collection constructs a `Midend`.
2. **How slow the suite is with parallelism off.** Stryker forces
   `maxWorkers: 1`; the dry run *is* the suite, serially.
3. **How much of the target is module-scope code.** Those mutants can't always be
   attributed per-test.

Mutation cost is *derived* from suite cost, twice over — so
`right-size-the-test-gate` cutting the suite by 53% CPU cut an identical dry run
from 19m11s to 7m34s.

### Timeouts are non-termination, not contention — and you can tell without re-running

346 of the 2,168 mutants (16%) timed out, 227 of them in `latin.ts`. Stryker
scores a timeout as *killed*, so the result is unaffected, but whether they are
genuine infinite loops or artifacts of a loaded box decides whether a large share
of 398 minutes was wasted. The report already answers it:

| module | timeout rate | loops per 100 lines | covering set |
| --- | --- | --- | --- |
| `dsf.ts` | **46%** | 3.1 | tiny |
| `latin.ts` | 24% | **7.5** | the latin games |
| `deduction-fixpoint.ts` | 21% | 1.4 | five consumers |
| `border-grid.ts` | 14% | 1.5 | two games |
| `midend.ts` | 6% | 0.8 | ~the whole suite |
| `save.ts` | **0%** | **0** | small |
| `grid.ts` | **0%** | **0** | grid tests |

Two things fall out, and they point the same way. **The two modules with no loop
at all had exactly zero timeouts across 125 mutants** — a type guard and a switch
cannot fail to terminate however loaded the box is. And the rate runs *inversely*
to covering-set size: `midend.ts`, whose covering set is essentially the whole
suite and which therefore takes longest per mutant, times out least. Contention
predicts the opposite. The mutator mix agrees — `UpdateOperator` (an `i++` turned
`i--`) and `BlockStatement` (an emptied loop body) are a third of `latin.ts`'s
timeouts and are *definitionally* non-terminating inside a hand-rolled `while`.

So the budget was spent on genuine infinite loops, which is the correct thing for
a mutation run to spend it on, and **a re-run should be budgeted at the same
~400 minutes rather than hoped to be faster on a quiet machine.** The lever that
would actually move it is `timeoutMS`, and lowering it costs information (a slow
survivor misreported as killed) rather than correctness.

**Reading the report:** `mutation-shape.mjs` (in the archived audit) turns
`metrics/mutation/report.json` into the per-module table and, more usefully,
**survivor clusters by `(module, mutator)`**. 331 survivors walked in file order
is a list, not a triage; `ConditionalExpression × 52 in midend.ts` is one
decision. Expect conditionals and boolean literals in orchestration plumbing to
be largely equivalent.

---

## 7. The rule that caught the most: check the instrument against something external

**An instrument's unit of measurement is part of its correctness**, and you
cannot verify it by re-reading your own reasoning. Every row below was caught
only by checking against something *outside* the tool — and the last three are
the variant to watch hardest, where the unit was right and the instrument was
**capped or blind**, so it reported health over a scan of nothing:

| instrument | wrong because | caught by |
| --- | --- | --- |
| snapshot-pairing script | measured per `it`, rule is per `describe` | reading the flagged files — all 6 findings phantom |
| mutation probe harness | reported SURVIVED when its edit didn't apply | a non-unique anchor |
| "−70% faster suite" | summed per-test **wall clock** on a loaded box | `/usr/bin/time`: the real figure was −53% |
| "modules with no test" | matched on **filename** | asking which tests *import* the module |
| mutation report table | no column for `Ignored` | reading Stryker's published schema |
| distilled report | flattened `location.start.line` | output below the fold I hadn't checked |
| **"killed by its own test file"** | Stryker **bails on first failure**, so it names the first covering test, not the capable ones | every killed mutant having exactly *one* `killedBy` — then deleting a `case` arm and watching `grid.test.ts` fail alone |
| **"the module's own test file"** | one file named after the module is not its tests | eight engine files import `midend.ts`; naming one reports a filing convention as a feedback hole |
| **knip's "0 unused exports"** | its resolver does not follow this tree's `.ts` import specifiers, so its graph stops at each entry file | `--trace-export initSentry`, a symbol imported on line 1 of `main.ts`, answering "No export found" — the honest count is 373 |
| **the complexity distribution** | read through biome's default `--max-diagnostics=20`, so *every* threshold from 15 to 100 reported exactly "20" | the flatness itself: a distribution that does not move is the cap, not the tree |
| **"86.5% of specifiers resolved"** | counted bare package imports as failures to resolve | listing them: 11 of 4183 actually failed, all `?raw`/`?inline` assets |
| **an import-cost micro-benchmark** | stubbed the module namespace as plain data properties, where vite defines exports as **getters**; V8 hoists the one and not the other | it measured the imported arm as *faster*, contradicting a mechanism already confirmed by reading the transform's output |
| **"the A/A control flatters itself"** | the control's arms were not warmed before the clock started, so the first paid JIT warm-up and the second did not | warming every arm: one instance timed twice reads 0.98–1.02, the same as two separately loaded instances |
| **a random-input fuzz over all 57 games** | it drove every game through a real `Midend` and reported clean, but the defect it generalized (a stale armed gesture surviving an undo) needs a four-step coincidence random play does not assemble | handing it the **unfixed** game as a control — Pegs with its `changedState` stripped passed too, at 400 steps and again at 2,400 across two alphabets |

**The last row is the cheapest habit on this page: hand a sweep a known
positive before believing it found nothing.** A clean result from a broad sweep
is a claim about the *instrument's reach*, and a fuzz's reach is invisible —
57 games, 27,000 real inputs and a green line say nothing about whether the one
sequence that matters was ever assembled. The control costs one run (spread the
game object, drop the fix, re-run) and it converted "the collection is clean"
into "this instrument cannot answer the question", which is why the fuzz was not
shipped. This is AGENTS.md's "prove a new guard fails before trusting it" aimed
at a sweep rather than at a single assertion, and it applies hardest exactly
where the sweep is broadest, because breadth is what makes a null result feel
earned. What answered the question instead was reading the population: the 37
games with no `changedState` are a list you can sit down with.

Three further habits fall out. **Give a table a total and assert the columns sum to it** —
then a status cannot vanish by omission. **Validate a parser against the real
schema, not against a fixture you wrote from your own understanding of it** —
that validates the understanding, not the parser. And **before believing a
derived metric, read what the tool documents it to mean**: `killedBy` is a field
about Stryker's execution, and only a reading that assumed it meant "the tests
capable of killing this" turned it into a ranking of modules.

The most expensive of these was a caveat that was *too strong*: "836 static
mutants went unevaluated", written into three files, when 831 of them had been
tested and the real gap was five. An overstated caveat misleads exactly as much
as a missing one.

The most *consequential* was the last pair: they ranked `grid.ts` second-worst
when it was perfect and `midend.ts` mid-table when it was worst, and a follow-up
change was scoped and its spec written around that order before anyone measured
it. **A number that survives into a proposal has still not been checked.**
