# Design — add-slant-hint

## Context

Slant's solver (`solver.ts`, faithful port of `slant_solve`) drives the board
to the unique solution by a fixpoint over three passes: a clue-point counting
pass, a square pass (loop / dead-end / equivalence-slash), and a v-shape /
equivalence-merge pass. Only the first two passes ever *place* a square (call
`fillSquare`); the v-shape pass is pure plumbing that establishes
equivalence classes and clears the v-shape bitmap so later square-pass firings
can fire. So the hint has exactly **four move-producing techniques** to
narrate. See the measured distribution in `proposal.md`.

## Decisions

### D1 — Recorder + seed threaded through the real solver (gated)

Extend `slantSolve(w, h, clues, soln, sc, difficulty, opts?)` with
`opts.record?: (f: SlantFiring) => void` and `opts.seedFrom?: Int8Array`.
Recorder off **and** no seed ⇒ the generator's call is byte-for-byte
unchanged (verified by the existing differential). A firing carries its
technique, the square(s) it forces, the driving clue (clue techniques), an
anchor filled square (equivalence), and a snapshot of `soln` after the firing
(for stale-safe evidence, the Range `HintMove.grid` pattern).

`seedFrom` replays the player's current `soln` through `fillSquare` after the
scratch is initialised (syncing the connectivity DSF, exit counts and
equivalence classes) so the recorded loop continues *from the player's
position*, recording only the moves they have not yet made — the analogue of
Range's `dup = grid.slice()`. This is sound because the deductions are
monotone and the board is uniquely solvable from the clues alone; a correct
partial fill only shortens the remaining deduction.

### D2 — `deduceHintPlan(state)` runs at Hard from the player's marks

`hint()` refuses on a solved board and on a board with detectable mistakes
(reusing `findMistakes`, so the refusal lights the overlay + banner). Otherwise
it seeds the current `soln` and runs the recording Hard solver, mapping each
firing to a `HintStep` journey. Running at Hard even for an Easy board is fine
— on an Easy board only the Easy techniques ever fire.

### D3 — Four techniques, two quality tiers

- **Clue-counting (fill / empty), loop, dead-end** — first-class, glance-able,
  full Palisade bar (~94–98% of firings):
  - *clue-fill*: "The clue N still needs as many lines as it has empty squares
    that can reach it, so every one must slant toward it." (0 empty-square edge
    handled; a 4-clue special-cased: "A 4 is touched by all four diagonals.")
  - *clue-empty*: "The clue N already touches its N diagonals, so every other
    square around it must slant away." (0-clue special-cased.)
  - *loop*: "Slanting this square one way would join two points already linked
    by a chain of diagonals, closing a loop — so it must slant the other way."
    Evidence: shade the connected chain.
  - *dead-end*: "Slanting this square one way would seal these points off from
    the grid's edge with no way out, trapping them in a loop — so it must slant
    the other way." Evidence: shade the two trapped components.
- **Equivalence-to-filled** — the honest **locked-slant** tier (~2–4%):
  "This square is locked to the same slant as the highlighted one (the clues
  around them leave no other option); since that one is a `\`, this must be a
  `\` too." Evidence: ring the anchor + shade the locked class. This is the
  §5.6 sanctioned honest-non-local treatment: it names the technique and shows
  evidence, but does not reconstruct the (multi-step, non-glance-able) v-shape
  / 2-clue-pairing chain that established the lock — Slant has no on-board mark
  to externalise that chain (§1B), so compressing it into one sentence would
  fail the glance-able bar. **This is the one deliberate quality dip and is
  flagged for owner acceptance.**

### D4 — Grouping via `continuesPrevious` legs, not a new move type

A clue firing forces up to four squares at once. Rather than add a multi-square
move (Filling's `fillCells`), emit the firing as a multi-leg journey: the first
square opens the journey (leg narrates the clue deduction), the rest are
`continuesPrevious` legs ("…and the same clue forces this one"). This reuses the
existing single `set` move and leaves `executeMove` untouched; auto-hint plays
the legs back-to-back as one hint, and `hintKeepTrack` stays per-square. A later
refinement to an all-at-once multi-square step is possible but not needed for
the bar.

### D5 — Rendering: appended palette, cache bits, highlight-not-perform

Target square(s) render `COL_HINT` blue with **no slash drawn** (the move is
not performed until auto-hint's `executeHint` applies it — §5.1); evidence
squares shade `COL_HINT_CELL`; a cited anchor rings `COL_HINT_REF` (teal, the
cross-game "cited filled premise" hue); the driving clue's digit recolours
`COL_HINT` (the Pattern/Towers clue↔move tie) via per-vertex hint bits mirroring
the existing `ERR_TL/TR/BL/BR` four-tile pattern. All hint state folds into the
existing packed `Int32Array` tile word (bits 21+ are free — no sidecar), so the
diff key covers it by construction. Colours are appended past the upstream enum
so slant's dark-mode overrides (indices 1/8) never touch them.

## Risks / trade-offs

- **Equivalence narration is weaker than the rest** (D3). Mitigation: it is a
  small minority of firings, the honest wording is truthful and carries visible
  evidence, and the treatment is precedented (Filling §5.6). Owner-flagged.
- **Seeding correctness.** A mistaken board could desync the solver; guarded by
  refusing when `findMistakes` is non-empty, so only correct partial fills are
  ever seeded.
