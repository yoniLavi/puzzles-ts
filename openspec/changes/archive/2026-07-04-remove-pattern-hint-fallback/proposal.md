# Remove Pattern's generic "just because" hint fallback

## Why

`adopt-narratable-deduction-engine` (archived 2026-07-03) set the standing bar:
**a displayed hint step always names a technique — no generic un-narrated
fallback.** Pattern is the one game still violating it. When its two elegant
techniques (overlap → black, unreachable → white) don't cover a forced cell,
`deduceHintPlan` falls back to `fallbackFiring`, which emits a `forced` step
narrated *"Only one arrangement of this column's clues fits, so these cells must
be black."* That is the flagged residual — it neither names a recognisable
nonogram technique nor explains *why those particular cells*; it just asserts the
line's arrangement is unique (in fact misleadingly — the deduction is that the
cells agree across **all** fitting arrangements, not that only one fits). It fails
hint quality-bar rule 1 (hint-authoring §1). Board-level the residual is
size-dependent — ~0.3% (10×10) rising to ~28% (30×30), design D4 of the parent —
and every such board is **fully deductively solvable** (the per-line solver
cracks it); the two elegant techniques simply don't name the step.

## What Changes

Per the parent change's design D4 (recommended: **promote, don't reject**), keeping
every generated board and the byte-match differential:

- **Reframe the leftover `doRow` deduction as an honest, named bottom rung.** The
  `forced` reason becomes a **single-line intersection** technique narrated in the
  necessity voice — *"whichever way this column's runs fit, these cells are always
  black"* (a real technique: the cells forced in **every** arrangement of one
  line's runs consistent with its marks, the same family as overlap, generalised).
  `fallbackFiring` stays the mechanism (`doRow`'s first forced same-value segment)
  but stops being a "just because" — it is now the ladder's explained bottom rung.
  Fix the misleading "only one arrangement fits" wording (which trips the
  `\bis\b`-style conclusion guard patterns anyway, hint-authoring §2.7).
- **(Measured, may be deferred) Enrich the elegant technique set** — edge/anchor
  forcing, run-completion, gluing — so common cases surface an *elegant* step and
  the bottom rung fires rarely. This is a *teaching-elegance* investment, not a
  correctness one (the bottom rung already makes the plan complete). Gate the depth
  of enrichment on the **measured per-size fraction of hint steps that fall to the
  bottom rung** — enrich until it's small at the shipped sizes, no further.
- **Keep generation untouched** → every board and the byte-match differential are
  retained (the fallback is hint-only; `solvePuzzle`/`isSoluble` are not touched).
- **Spec + guide:** remove the "falls back to a single forced cell" allowance from
  the pattern hint requirement; state that every step names a technique (the bottom
  rung included). Update hint-authoring §5.6a.

**The stricter `reject` alternative** — accept only boards the *elegant* techniques
solve, forfeiting the byte-match and retiring `doRow` — is documented and advised
**against** (design D4): at 30×30 it discards ~28% of boards and biases survivors
toward regularity; it trades a deductive bar for a teaching-elegance bar. Recorded
here as the road not taken; the final call is confirmed against the measured
residual during implementation.

## Impact

- Affected specs: **`pattern`** (MODIFY the explained-hint requirement — replace the
  generic-fallback allowance with the named single-line-intersection bottom rung).
- Affected code: `pattern/solver.ts` (`PatternHintReason` — retire `forced`, add the
  intersection reason; `fallbackFiring` narration/reason), `pattern/index.ts`
  (`narrate` for the new reason; render colour reuse — the bottom rung is `COL_HINT`
  like the other black/white techniques, no new legend colour), plus any enrichment
  techniques added to `analyzeLine`.
- Docs: `docs/porting/hint-authoring.md` §5.6a (re-derive the named technique from the
  packing; the intersection bottom rung as the always-explained completion).
- Tests: `pattern-hint.test.ts` (assert no step ever carries a generic/unnamed reason;
  the intersection step names the technique), `hint-resume` stays green (the bottom
  rung is a subset of `doRow`, so the plan still always completes). The byte-match
  differential is unchanged (generation untouched).
