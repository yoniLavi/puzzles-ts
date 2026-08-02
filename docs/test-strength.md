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
`2026-08-02-audit-test-suite-strength` (2,168 mutants, 398 minutes) and
`2026-08-01-right-size-the-test-gate`.

---

## 1. Three properties, routinely confused

| property | question | how you measure it |
| --- | --- | --- |
| **coverage** | is this line executed? | line coverage — and it is the least interesting |
| **strength** | would a wrong answer here be *noticed*? | mutation: change the line, see if anything fails |
| **feedback** | noticed **by what**, and how soon? | which test file killed it |

The collection is strong on the first two and weak on the third. Measured over
the seven highest-leverage engine modules:

| module | survivors | killed by its **own** test file |
| --- | --- | --- |
| `grid.ts` | **0** / 40 | **1 / 40 (3%)** |
| `latin.ts` | 117 / 944 | **9 / 593 (2%)** |
| `midend.ts` | 122 / 741 | 208 / 531 (39%) |
| `border-grid.ts` | 51 / 259 | 150 / 168 (89%) |

`grid.ts` has **zero** surviving mutants and is killed by its own tests once in
forty. It is fully protected and almost silent. That combination is the dangerous
one here, because this repository's test-run economy tells you to run the files
you touched and let the commit hook be the single full run — advice that returns
green on a broken module when local kills are 2%.

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

---

## 3. Writing a test that discriminates

**A test passing on first write is not evidence it works.** Four real gaps were
found in this session's own new test files, each of which passed immediately:

- `wires.test.ts` — "needs the connection from BOTH sides" passed with the
  both-sides check *deleted*, because the case it chose was one an unrelated
  guard already caught. The discriminating case had to be a neighbour wired to
  *nothing*.
- `symmetric-blacks.test.ts` — the degree-2 region's `+ hodd` could be deleted
  with everything green (the mirror still mirrors; it just leaves the centre row
  permanently white), and `<=` could become `<` unnoticed because the two differ
  only on the draw that *equals* `blackpc`.

So: **flip the line the test is for, watch it go red, put it back.** Seconds of
work, and the only thing separating an assertion from a decoration.

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

**But the boundary must be checked, not asserted.** In `symmetric-blacks.ts`,
dropping the guard on `if (!rotate) rw += wodd` changes the 4-fold region size on
an odd-width board — so it changes which boards exist without breaking any
symmetry, and it survives every local test *by design*. Light Up's and Sticks'
differentials fail on it. That was confirmed by running them against the
mutation; the test file records the boundary so a later reader can place a new
case on the right side of it.

Conversely, when you extract logic into `src/native/engine/`, **write the tests
in the same change**. Extraction moves the code but not its tests: the game's
differential still catches defects, nothing turns red, and the module quietly
arrives with no local assertions. `wires.ts` (413 lines, nine importers) had none
at all.

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

---

## 6. Full mutation testing — when it is worth it, and what it costs

`npm run mutation` (config: [`scripts/stryker.config.mjs`](../scripts/stryker.config.mjs),
which documents its own settings). Reach for it to *close* a question the cheap
probes have opened, not to open one. **It is an audit, never a gate, and its
score is never ratcheted** — a number that invites maximising invites tests
written against mutants rather than against behaviour.

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

**Reading the report:** `mutation-shape.mjs` (in the archived audit) turns
`metrics/mutation/report.json` into the per-module table and, more usefully,
**survivor clusters by `(module, mutator)`**. 331 survivors walked in file order
is a list, not a triage; `ConditionalExpression × 52 in midend.ts` is one
decision. Expect conditionals and boolean literals in orchestration plumbing to
be largely equivalent.

---

## 7. The rule that caught the most: check the instrument against something external

**An instrument's unit of measurement is part of its correctness**, and you
cannot verify it by re-reading your own reasoning. Six instances in one session,
every one caught only by checking against something *outside* the tool:

| instrument | wrong because | caught by |
| --- | --- | --- |
| snapshot-pairing script | measured per `it`, rule is per `describe` | reading the flagged files — all 6 findings phantom |
| mutation probe harness | reported SURVIVED when its edit didn't apply | a non-unique anchor |
| "−70% faster suite" | summed per-test **wall clock** on a loaded box | `/usr/bin/time`: the real figure was −53% |
| "modules with no test" | matched on **filename** | asking which tests *import* the module |
| mutation report table | no column for `Ignored` | reading Stryker's published schema |
| distilled report | flattened `location.start.line` | output below the fold I hadn't checked |

Two habits fall out. **Give a table a total and assert the columns sum to it** —
then a status cannot vanish by omission. And **validate a parser against the real
schema, not against a fixture you wrote from your own understanding of it** —
that validates the understanding, not the parser.

The most expensive of these was a caveat that was *too strong*: "836 static
mutants went unevaluated", written into three files, when 831 of them had been
tested and the real gap was five. An overstated caveat misleads exactly as much
as a missing one.
