# extend-feedback-probe-corpus — findings

**14/21 → 20/20, plus one case reclassified equivalent.** Four modules, chosen by
importer count rather than by where the mutation audit happened to look.

| module | importers | before | after |
| --- | --- | --- | --- |
| `params.ts` | **90** | 3/6 (50%) | 6/6 |
| `grid-core.ts` | 7 | 2/4 (50%) | 4/4 |
| `colour-mkhighlight.ts` | **37** | 4/5 (80%) | 4/4 |
| `findloop.ts` | 6 | 5/6 (83%) | 6/6 |

Three of the seven survivors are worth reading; the fourth changed the
instrument.

---

## 1. `params.ts` — the widest-reach module in the engine had no test for its two riskiest functions

`parseLeadingInt` and `parseDimensions` were well covered. `atof` and `formatG`
were not covered at all, and both exist *specifically* to prevent a silent
failure that their obvious alternatives cause:

- **`atof` returns 0 rather than `NaN`.** Its own doc comment says why: `NaN < min`
  and `NaN > max` are **both false**, so a typo in a custom-params box would slip
  past every bound check in the game's `validateParams` and reach the generator.
  Now asserted across eight inputs plus a blanket "never returns NaN, whatever it
  is fed".
- **`formatG` is C's `%g`, emphatically not `String(x)`.** A float param encoded
  at full double precision reads back through `atof` as a *different* number than
  the one that generated the board, so the game ID stops naming the board it came
  from. Now twelve cases pinning six significant digits, trailing-zero stripping
  and both exponential thresholds (below 1e-4, at/above 1e6) — plus the property
  the encoder actually exists for: `atof(formatG(v)) ≈ v`, and re-encoding is a
  fixpoint.

Two of the six planted defects were in `formatG` alone (full precision, and
never switching to exponential), and both survived. The lesson is not "params
was under-tested" but **the shape of what was untested**: the two functions whose
doc comments spell out a silent-failure mode were the two nothing checked.

---

## 2. `grid.test.ts` had a vacuous assertion, and only a planted defect showed it

Halving every dot's degree in `makeConsistent` (`e.dot1.order++; e.dot2.order++`
→ one of them) passed **all 151 tests in `grid.test.ts`**, which includes
`expect(d.edges.length).toBe(d.order)`.

It passed because that assertion **cannot fail**: `d.edges` is *allocated* as
`new Array(d.order)`, so its length is `d.order` by construction. The test
compares a value with itself. It reads like a strong structural invariant across
all eighteen tilings and asserts nothing.

The non-vacuous statement is the one the builder has to get right: **a dot's
degree is the number of edges that actually name it as an endpoint**, counted
independently. That, plus "every edge slot is filled" and "at most one null face,
and only where the infinite exterior breaks the ring", is what the file now says.

The face-null bound is worth its own line, because the first attempt asserted no
nulls at all and failed on 28 tilings: an interior dot is ringed by exactly
`order` faces, but a boundary dot's ring is broken **once** by the exterior. "At
most one, and only on the boundary" is the real invariant, and a second null
would mean the anticlockwise walk gave up early — which is exactly the fourth
planted defect.

**Generalisable: an assertion whose two sides derive from the same value is a
decoration.** Grep for the shape — `x.length` against the thing that sized `x`.

---

## 3. An unreachable branch, settled by measurement rather than by argument

`mkhighlight`'s `dw < K ? [1, 1, 1] : colourMix(bg, white, K / dw)` — the
saturate-to-pure-white arm — is **unreachable**, and the reason is neat:
`mkhighlightBackground` shifts the background until it is *exactly* K from the
extreme, so `K / dw` is exactly 1 and the mix already yields pure white.

Not argued — swept. 9,261 backgrounds over the whole RGB cube at 1/20 steps: the
adjusted background was within K of white or black **zero** times. So it is
triage class (b) (unreachable in practice — record it, keep the code, do not
write a test that cannot fail), and the case carries the sweep in its note.

---

## 4. The instrument was wrong again, in the same place, in the other direction

`grid-core.ts` scored 2/4, and the two survivors looked like real feedback holes.
They were not: `grid.test.ts` exercises `makeConsistent` across all eighteen
tilings — it just imports it through the **`grid.ts` barrel**, whose own doc
comment says *"import from this module, not from the parts"*. The harness
followed direct imports only, so it derived `grid-trim.test.ts` (6 tests) as
`grid-core.ts`'s entire local test surface.

`ownTests` now resolves one level of re-export, which brings `grid.test.ts`,
`grid-desc.test.ts`, `grid-incentre.test.ts` and `loopgen.test.ts` into
`grid-core.ts`'s set.

**This is the third time the same question — "what are this module's own
tests?" — has been answered wrongly**, after `audit-test-suite-strength` §5a
(matched on filename) and `strengthen-engine-test-feedback` (one file named
after the module). Each wrong answer produced a different false picture, and
each was caught the same way: by asking *does this test actually catch it?*
rather than by re-reading the derivation.

Worth noting what did **not** happen: the barrel fix did not make the finding go
away. `grid.test.ts` failed to catch the halved-degree defect too — for the
independent reason in §2. Fixing the instrument and fixing the code were both
required, and doing only the first would have closed a real gap with a shrug.

---

## 5. Cost

**+13 tests** (34 in `params.test.ts`, 7 in `findloop.test.ts`, and the rewritten
dot-invariant block in `grid.test.ts`). All tier-1 arithmetic; no measurable
change to the gate. The probe corpus is now **93 cases across 14 modules**;
`npm run probe -- --verify` remains ~0.2 s.
