# Change: Deduction-based hint for Palisade

## Why

Palisade shipped (port #13) with no hint — the only deliberate-divergence
gameplay aid it lacks. Unlike Sixteen/Fifteen/Flood (whose hints replay a
solver's *move sequence*), Palisade's natural hint is **the next logical
deduction**: "this edge must be a wall (or has no wall) because …". The
six-rule deductive solver already exists; this change surfaces one step of it
as a narrated, highlighted hint wired to the existing `hint()` plan hook.

## What Changes

- Add a hint-mode pass over the existing Palisade solver that, seeded from the
  **player's current borders and no-wall marks**, records every edge the
  deductions force (wall via `disconnect`, no-wall via an individually-forced
  `connect`) in discovery order, each tagged with the rule that fired.
- Implement `Game.hint()` for Palisade returning the whole remaining deductive
  chain as a multi-step plan (one forced edge per step), and `hintKeepTrack()`
  classifying the player's edge edit against the displayed step.
- Translate each deduction into a **visible** edge edit: a connect deduction
  (which lives only in the solver's DSF) becomes a no-wall mark; a disconnect
  becomes a wall.
- Narrate per rule (e.g. "Clue 3 already has all its walls, so this edge has
  none") and highlight the target edge (and the driving clue cell, for
  clue-based rules) in a new `COL_HINT` colour.
- Guard: refuse a hint when the board has a mistake (re-uses `findMistakes`)
  or is already solved, so a hint is never built on a wrong wall.
- Shell polish surfaced by these full-sentence narrations: cap the shared hint
  banner to the board width and wrap it (mirroring the statusbar), so a long
  hint grows downward rather than widening the game element.

## Impact

- Affected specs: `palisade` (ADDED requirement: deduction-based hint).
- Affected code: `src/native/games/palisade/{solver,index,render}.ts`
  (hint-mode deduction recorder, `hint`/`hintKeepTrack` hooks, `COL_HINT` +
  hint render bits). New tests in the existing palisade test files.
  `src/puzzle/puzzle-view.ts` — hint-banner width cap + wrap (shared shell).
- No engine change: `hint()`/`hintKeepTrack()`/`HintStep.highlights` and the
  midend's plan lifecycle already exist (Sixteen/Fifteen/Flood precedent).
