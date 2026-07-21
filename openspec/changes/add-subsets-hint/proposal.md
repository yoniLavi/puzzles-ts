# add-subsets-hint

## Why

Subsets shipped its native-TS port (`add-subsets-ts-port`, archived 2026-07-21)
**without** an explained hint — per the standing rule that a Palisade-grade
`hint()` is always its own change. Subsets is a genuinely deductive puzzle with
an unusually crisp rule vocabulary: the horseshoe arrows are *containment*
statements ("everything in that cell is also in this one"), the missing arrows
are *incomparability* statements ("neither contains the other"), and every set
appears exactly once. Each of the solver's deductions has a narratable *why*
that teaches a real technique — arrow propagation, disjointness, last-place
placement.

This change adds `Game.hint()` / `Game.hintKeepTrack()` to Subsets, turning the
existing six-rule cube solver into a **second projection of one deduction
engine** (solver + hint), narrating each forced letter mark by the containment
or counting rule that forces it.

## What Changes

- **A recording deduction pass in `solver.ts`** — a parallel recorder (the
  Clusters F1 / Undead §9.4 shape: separate functions reusing the module's
  primitives, so `subsetsSolveGame` carries no recorder flag and the frozen
  desc differential is unaffected *by construction*). It runs the fixpoint
  **from the player's current marks** (no reset) and emits an ordered list of
  letter-level firings, each tagged with the deduction that forced it and the
  cells that are its evidence (design D1–D3).
- **`hint()` / `hintKeepTrack()` in `index.ts`** — build a narrated
  `HintResult`: one deduction firing = one journey (a firing that decides
  several letters of a cell emits its letter moves as `continuesPrevious`
  legs), the acted-on cell as the `COL_HINT` target, the evidence cell(s)
  shaded, prose stating premise → conclusion. Refuse on a mistaken board
  (`findMistakes` or a solution contradiction — design D5) with the standard
  banner, and on a solved board.
- **Hint rendering in `render.ts`** — `COL_HINT` target + `COL_HINT_CELL`
  evidence shading through the shared `OverlaySidecar` (playbook §3.2),
  auto-guarded by the cross-game `hint-overlay.test.ts` once Subsets joins
  `testing/hint-games.ts`.
- **A guess-free / from-position audit** (design D2) — measure that the
  narratable deduction closes every generated board from any
  correct-marks-so-far position, before writing prose.

Explicitly **not** in this change:

- **No solver-strength change.** The recorder narrates exactly the compiled
  rules; the dead half of `apply_arrows_advanced` stays unported (the port's
  design D2) — the hint must never deduce what the generator's solver could
  not, or it would narrate boards into states the uniqueness gate never
  vetted.
- **No new tiers, sizes or generator changes.**

## Impact

- Affected specs: `subsets` (ADD a hint requirement).
- Affected code: `src/native/games/subsets/{solver,index,render}.ts` + tests
  (`subsets-hint.test.ts`, a render-scenario hint frame + snapshot).
- No engine changes: hint hooks, `ActiveHint` lifecycle, auto-hint pacing and
  the overlay sidecar all exist; Subsets is a new *implementer*.
- Parity-gated like a port: owner acceptance before archive.
