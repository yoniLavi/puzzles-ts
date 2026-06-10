# Change: Quick-save slot + combined Check-&-Save

## Why

The app already has named saves, autosave, checkpoints, and file
import/export — but no *one-action* "bookmark where I am now" slot, the
last open item in migration-order item 6. For a deduction game a plain
quick-save is only half a feature: it will happily checkpoint a board
you have already wrecked. The owner's idea — **validate, then save only
if clean, else flag the errors** — turns quick-save into something
upstream has no equivalent of: *bookmark me, but only while I'm provably
still on the solution path*, so quick-load always returns a known-good
position. This change adds the quick-save primitive and the combined
**Check & Save** button that composes it with `findMistakes`
(`add-findmistakes-galaxies`).

## What Changes

- **Quick-save slot.** One dedicated quick-save per puzzle in IndexedDB
  (a new `SaveType.Quick`, a single record per `puzzleId`), distinct from
  the named-save library and autosave. `savedGames.quickSave(puzzle)` /
  `quickLoad(puzzle)` / a reactive `hasQuickSave(puzzleId)`.
- **Combined Check-&-Save button** in the app shell. When the game
  implements mistake-checking (`canFindMistakes`): activate → `findMistakes()`;
  **0 mistakes → quick-save** + "Checkpoint saved ✓"; **>0 → highlight
  them** (already a side effect of `findMistakes()`) + "N issues found —
  not saved", leaving the previous quick-save intact (**hard-block**,
  Decision 1). When the game has no mistake-checking, the same control
  degrades to a plain **Quick-save**.
- **Quick-load.** A paired action restores the quick-save slot; enabled
  only when a slot exists. (Decision 2: a split/secondary action, not a
  mode-toggling single button.)
- **Keyboard.** Intercept Cmd/Ctrl+S → Check-&-Save (suppressing the
  browser "save page"); quick-load via the button's secondary action.
- The named-save library still saves a messy board if the user really
  wants to — only the *combined* button is opinionated.

## Impact

- Affected specs: new `quick-save` capability.
- Affected code: `src/store/db.ts` (`SaveType.Quick`), `src/store/saved-games.ts`
  (quick-save/load/has), `src/screens/puzzle-screen.ts` (button + commands +
  Cmd/Ctrl+S), small toast/feedback helper.
- Depends on `add-findmistakes-galaxies` for the validation half. No
  change to existing named-save / autosave / checkpoint behaviour.

## Decisions to confirm (owner)

1. **Hard-block save when mistakes exist** (proposed) vs. save-anyway-but-warn.
2. **Quick-load as a paired/secondary action** (proposed) vs. a single
   toggling button.
