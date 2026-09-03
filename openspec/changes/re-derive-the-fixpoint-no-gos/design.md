# re-derive-the-fixpoint-no-gos — design

## D1. Singles: the drain is a technique, and the flag is the `-1` arm

Today:

```
solveSinglesep(state, ss); solveDoubles(state, ss); solveCorners(state, ss);
if (diff >= DIFF_TRICKY) solveOffsetpair(state, ss);      // one-shot pre-pass
while (true) {
  budget?.tick();
  if (ss.ops.length > 0) solverOpsDo(state, ss);
  if (state.impossible) break;
  if (solveAllblackbutone(state, ss) > 0) continue;
  if (state.impossible) break;
  if (diff >= DIFF_TRICKY) {
    if (solveRemovesplits(state, ss) > 0) continue;
    if (state.impossible) break;
  }
  break;
}
```

Three mappings, none of them a new runner option:

1. **The op-queue drain is technique 0, returning `0`.** The ladder restarts from
   the top on every firing, so a technique in position 0 that never reports a
   firing is attempted exactly once per iteration, before anything else — which
   is the drain's contract, stated in terms the runner already guarantees.
2. **`state.impossible` becomes the `-1` arm, per technique.** Each technique
   ends `return state.impossible ? -1 : 0`, mirroring the flag check the original
   performs after *that* technique.
3. **`diff >= DIFF_TRICKY` on `solveRemovesplits` is `maxTier`.** The pre-pass
   above the loop stays above the call; it was never a ladder member.

**The one ordering that must be reproduced exactly, and how.** The original
checks `> 0` *before* the flag, so a technique that both makes progress **and**
raises `impossible` takes the `continue` — which drains the op queue once more
before the next flag check stops the loop. So each technique returns its firing
count when positive and only then consults the flag:

```
run: () => { const r = solveAllblackbutone(state, ss); return r > 0 ? r : state.impossible ? -1 : 0; }
```

Trace: `r > 0` with the flag up ⇒ firing ⇒ the ladder restarts ⇒ technique 0
drains ⇒ technique 0 returns `-1` ⇒ stop. That is the original's path, drain
included. Writing it the other way round (flag first) would skip that drain,
which mutates `state.flags`, and this is a solver-gated generator.

Singles needs **no `settled`**: its loop ends when nothing fires, which is the
runner's default.

## D2. Clusters: a closure, not a hook

`solveGame` returns the very verdict its early-out computes, so capture it:

```
let status: ClustersStatus = UNFINISHED;
runDeductionFixpoint({
  techniques: [ {id:"try", tier:0, run:…}, {id:"recurse", tier:1, run:…} ],
  maxTier: maxdiff,
  settled: () => { status = clustersValidate(grid, w, h); return status !== UNFINISHED; },
});
return status;
```

`settled` runs at the top of every iteration, exactly where `clustersValidate`
runs today, so it is called the same number of times. When the ladder stops
because nothing fired, `status` holds the last verdict — `UNFINISHED` — which is
what the original returns there too. `maxdiff < 1` becomes `maxTier: maxdiff`,
excluding the `recurse` technique.

A `settled?` returning the caller's verdict type would be the wrong shape
anyway: it makes the runner generic over a type it never inspects, to save a
caller one local variable.

## D3. Spokes: the tiers were a cap; the accumulator is an early-out

The row claiming Spokes' "tier is an accumulated action count" conflated two
things. `spokesSolve` returns a **status**, not a grade — nothing about it is
graded — and `total` is consulted only by `diff === DIFF_LIMITED && total >=
ACTION_LIMIT`, an early-out. The tiers are `DIFF_LIMITED (-1) < DIFF_EASY (0) <
DIFF_TRICKY (1) < DIFF_HARD (2)`, and the loop's `if (diff < DIFF_TRICKY) break`
/ `if (diff < DIFF_HARD) break` are a cap.

Two details that decide correctness:

- **`maxTier: Math.max(diff, DIFF_EASY)`, not `maxTier: diff`.** `DIFF_LIMITED`
  is *"an Easy pass capped at `ACTION_LIMIT`"* — its technique **set** is Easy's,
  and what makes it Limited is the bound. Giving the saturation and diagonal
  techniques `tier: DIFF_EASY` and clamping the cap says that; giving them
  `tier: DIFF_LIMITED` would say the opposite and read as nonsense.
- **The Tricky look-ahead runs at *exactly* Tricky.** The original gate is
  `diff === DIFF_TRICKY`, not `>=`: at Hard only the unbounded look-ahead runs.
  So the ladder is not a prefix, and the technique guards itself in `run` (the
  Unruly precedent). Making it a prefix would run the bounded trial before the
  unbounded one at Hard; the bounded trial mutates the board, so different
  contradictions would be committed first and every Hard board would move.

`total` accumulates inside the two techniques that accumulate it today
(saturation and diagonal — the look-aheads never did), and `settled` carries both
early-outs in the original's order:

```
settled: () => spokesValidate(b, s) !== "incomplete" || (diff === DIFF_LIMITED && total >= ACTION_LIMIT)
```

## D4. Why `solved` becomes `settled`

The hook is used by six callers after this change and means "solved" for two of
them:

| Caller | What it returns `true` for |
| --- | --- |
| Filling | every cell filled — solved |
| Pattern | no cell left unknown — solved |
| Undead | a candidate cell has been emptied — a **contradiction** |
| Clusters | complete **or** invalid |
| Spokes | complete, invalid, **or** this game's own action budget spent |
| Singles / Unruly / Magnets / Latin | (unused) |

A name that is wrong for four of six callers is not a naming quibble; it is the
reason a reader has to consult the doc comment to use the hook at all. `settled`
— *"the ladder should stop, because there is nothing left for it to do"* — covers
every case without a parenthetical. Internal contract, so per AGENTS.md ("Nothing
is sacred") this is a just-do-it rename rather than a proposal.

## D5. Loopy stays bespoke — and it is not because it cannot be transcribed

It *can* be. Loopy's `(thresholdDiff, thresholdIndex)` protocol transcribes
mechanically: each technique closes over the pair, returns `0` when the protocol
says to skip it, and assigns the pair when it fires. The status checks map onto
`settled`, and the mistake path is safe — every `ss.status = "mistake"` site
returns `0`, which is `DIFF_EASY`, i.e. **progress** in Loopy's inverted
convention (`DIFF_MAX` is its "nothing happened"), so a mistake always restarts
the ladder and is caught by `settled` before another technique runs.

**The reason to decline is what the transcription costs.** Today the protocol is
four lines in one place under a comment saying it is load-bearing for which
puzzles generate. Transcribed, it becomes three closures over two mutable
variables, and the one thing a reader most needs to see about Loopy's solver is
no longer readable in one place. The runner's central promise is that *a pass
attempts every technique at or below the cap* — that promise is what makes one
firing = one hint step and makes grading honest — and Loopy's entire optimization
is that it does not. Adopting would satisfy the letter of the interface while
hiding a board-deciding protocol inside it.

That is the framework's own rule: it "never contorts a game to fit a contract",
and the bespoke-loop hatch exists for exactly this. **Tell** (from the RDD):
*your loop's bookkeeping decides which boards exist* — Loopy's does, and says so.

## D6. Lightup has no ladder

```
for (;;) {
  if (gridOverlap(state)) return 0;
  if (gridCorrect(state)) return 1;
  let ncanplace = 0, didstuff = false;
  for (let x…) for (let y…) {                      // one fused pass, x outer
    if (couldPlaceLight(…)) ncanplace++;
    if (trySolveLight(state, x, y, …)) didstuff = true;
    if (trySolveNumber(state, x, y, …)) didstuff = true;
  }
  if (didstuff) continue;
  if (!ncanplace) return 0;                        // three-way, from the scan
  …
}
```

Its two techniques are interleaved **per cell** inside a single scan whose order
is load-bearing, and the pass sweeps the whole grid before restarting. "Return
after first firing" — the rule the whole runner is built on — is precisely what
Lightup must not do; splitting the scan into two ladder techniques changes the
order deductions land in, and generation is gated on the verdict. Nor is there
anything to gain by wrapping the fused scan in a single technique: a one-rung
ladder has no tier, no cap and nothing to restart, so the runner would add
indirection and no shared behavior.

## D7. Hatch obligations, stated

The RDD requires three of a bespoke loop. Against these two:

| Obligation | Loopy | Lightup |
| --- | --- | --- |
| Narratability survives | **vacuous today — Loopy ships no `hint()`**, so there is no hint projection to walk. Recorded as a gap against the vision's "nothing may ship hintless", not closed here. | met: `deduceHintPlan` walks the same `dosolve` with a recorder, and Lightup is enrolled in every cross-game hint guard. |
| Grading stays honest | its tiers gate real technique differences (`dlineDeductions` at Normal, `linedsfDeductions` at Hard) and generation is capped at the requested tier. | ditto via `flagsFromDifficulty`. |
| Budgets apply | no recording path, so no budget is needed or installed. | met: `solveSub` ticks a `stepBudget` on the recorder path only. |

## D8. Verification

Each adoption is checked against **its own frozen byte-match differential**,
which runs in the ordinary gate, plus that game's full suite. These are
solver-gated generators, so a single changed verdict on a single intermediate
board changes the published desc — which is exactly the assurance byte-parity was
kept for. A moved fixture means the adoption is wrong.

The rename is verified by shape: every changed line in the whole diff is either
`solved` → `settled` or one of the three adoptions, and the exceptions are read.
