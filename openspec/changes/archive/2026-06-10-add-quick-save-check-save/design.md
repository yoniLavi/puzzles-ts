## Context

Persistence is mature (`src/store/{db,saved-games}.ts`): `SaveType.User`
(named library) and `SaveType.Auto` (autosave), both routed through the
engine-agnostic `puzzle.saveGame()/loadGame()` (TS save codec + C/WASM).
What is missing is a single-action checkpoint slot and a UX that makes it
*meaningful* for deduction games by gating on `findMistakes`
(`add-findmistakes-galaxies`).

## Goals / Non-Goals

- Goals: one quick-save slot per puzzle; a combined button that only
  checkpoints a provably-clean board (and otherwise shows where the
  errors are); a quick-load; sensible keyboard. Reuse the existing save
  plumbing entirely.
- Non-Goals: multiple quick-save slots; thumbnails; redesigning the named
  library; quick-save on games without `findMistakes` becoming anything
  more than a plain save.

## Decisions

- **Compose two primitives; don't hard-weld.** The quick-save slot and
  `findMistakes` are independent; the button is app-shell glue. So a game
  without mistake-checking still gets a working (plain) quick-save, and
  we keep the option of a pure quick-save elsewhere.
- **`SaveType.Quick = 2`, one record per puzzle.** Constant filename
  (`"quicksave"`), so the compound key `[puzzleId, Quick, "quicksave"]`
  yields exactly one slot. No Dexie schema-version bump (new enum value
  is just data under the existing indexes). `quickSave` upserts;
  `hasQuickSave` is a `liveQuerySignal` so the quick-load control's
  enabled state is reactive.
- **Decision 1 — hard-block on mistakes (proposed).** The combined
  button's contract is "a checkpoint is a clean checkpoint." On mistakes
  it does not write the slot, so the previous good checkpoint survives.
  The named-save library remains the escape hatch for saving a messy
  board deliberately. (Alternative: save-anyway-and-warn — rejected as
  defeating the point, but cheap to switch if the owner prefers.)
- **Decision 2 — quick-load is a secondary action (proposed).** A
  split-button caret / secondary menu item, enabled only when a slot
  exists. (Alternative: one button that toggles save/load by context —
  rejected as ambiguous: the user can't tell what a press will do.)
- **Adaptive label.** `canFindMistakes` ⇒ "Check & Save"; else
  "Quick-save". Keeps one control across all games.
- **Cmd/Ctrl+S intercepted** for Check-&-Save (the intuitive "save now"
  chord), `preventDefault` on the browser save. Avoids colliding with
  per-puzzle letter input (which never uses the Cmd/Ctrl modifier).

## Risks / Trade-offs

- A new `SaveType` value touches the `removeAll*`/range-query helpers;
  audit them so a "clear all saves" still includes quick-saves (or
  deliberately excludes them — decide and test).
- Toast/feedback: reuse the existing alert/notification surface rather
  than introducing a new component.

## Migration Plan

- Additive only: existing User/Auto records untouched; `SaveType.Quick`
  is new data. No destructive migration. Rollback = stop writing/reading
  the Quick slot.

## Open Questions

- Should quick-load warn when the current board has unsaved progress
  ahead of the checkpoint? Proposed: a lightweight confirm only when
  `totalMoves` exceeds the checkpoint's. Confirm during implementation.
