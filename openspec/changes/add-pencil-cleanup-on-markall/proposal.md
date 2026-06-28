# Proposal: "Fill all pencil marks" cleans obvious candidates on a second press

**Status**: Proposed (owner-requested QoL, 2026-06-28). Best built on
`extract-cell-region-helpers` (it needs that change's per-game `regionsOf`).

## Why

Today the mark-all control (`M` / the toolbar button, `canMarkAll` games) fills *every*
empty cell with *all* candidates `1..n` — including candidates that are already impossible
because the value sits in the same row/column (or block/diagonal). The player must then
strike those obvious ones by hand (or rely on the incremental `auto-pencil` pref, which
only acts on *future* placements, not on the just-filled grid). A second press of the same
control should do the obvious cleanup in one click — exactly the "basic-region opening" the
hint system already teaches.

## What Changes

- **The mark-all action becomes adaptive.** A press fills all missing candidates if any
  empty cell lacks any; otherwise (the board is already fully noted) it **removes the
  obvious candidates** — every pencilled value that already appears as a placed value in one
  of that cell's uniqueness regions.
- **Per-game region definition** (reusing `regionsOf` from `extract-cell-region-helpers`):
  Towers / Unequal = row + column; Solo = row + column + block (+ X-diagonals); Keen = row +
  column (cages are *not* uniqueness regions). Games without a row/col uniqueness model
  (Undead) keep today's fill-only behaviour.
- **Deterministic + replayable.** The cleanup emits the existing atomic `pencilStrike`
  move with the marks computed at `interpretMove` time (the same "bake the decision into the
  move" rule `set { autoElim }` uses), so replay/undo are exact.

## Impact

- **Affected specs:** `ts-engine` (MODIFIED — the mark-all capability gains the
  clean-obvious behaviour). Per-game capability specs (`towers`, `unequal`, `keen`, `solo`)
  may note their region definition.
- **Affected code:** each pencil-mark game's `interpretMove` (`M` handling) + the shared
  region helper; the app-shell button is unchanged (same control, adaptive behaviour).
- **Depends on:** `extract-cell-region-helpers` for `regionsOf` / the duplicate scan. Land
  that first (or together).

## Out of scope

- Changing the toolbar control's icon/label (same button).
- Undead and other non-Latin-uniqueness games (fill-only stays).
- A separate "auto-candidate mode" that maintains cleaned notes continuously — this is a
  one-shot cleanup on demand, not a mode.
