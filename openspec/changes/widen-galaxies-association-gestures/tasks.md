# Tasks

## 1. The left-button gesture

- [x] 1.1 `Ui`: add `pressX`/`pressY`/`pressPending` (press pixel + "a
      left press is open"); `newUi` initialises them.
- [x] 1.2 Extract the RIGHT_BUTTON source-finding into `beginDrag`
      (dot under the pointer → nearest tile's existing arrow → …), so
      both buttons start a drag through one path.
- [x] 1.3 LEFT_BUTTON records the press instead of toggling; LEFT_DRAG
      past `DRAG_SLOP_PX` starts the drag; LEFT_RELEASE drops the drag
      or, within slop of the press, toggles the edge.
- [x] 1.4 Key the drag lifecycle off `isMouseDrag`/`isMouseRelease`
      rather than the exact button, so a long-press-promoted press
      finishes its own drag.
- [x] 1.5 **Consume the press.** `view-interactive.ts` installs pointer
      tracking only `if (consumed)`, and `Midend.processInput` reports
      `interpretMove`'s `null` as unconsumed — so a press held for later
      must still return `UI_UPDATE`, or no drag event is ever delivered
      and the release lands back at the press coordinates as a click.
      Cost a debugging session; now a rule in `input.md`.

## 2. The cell→dot gesture

- [x] 2.1 `Ui.dragToDot`; `beginDrag` starts one on an unassociated,
      dot-free tile.
- [x] 2.2 Reverse-mode target tracking: snap `dotx`/`doty` to the
      nearest legal dot within one tile, else none.
- [x] 2.3 `dropDrag`: skip the "back where it started" null-move test
      and the source-unassoc op in reverse mode.
- [x] 2.4 Keyboard: `CURSOR_SELECT` on a plain tile starts a reverse
      drag; cursor moves pick the dot; select commits.

## 3. Candidate rings + preference

- [x] 3.1 `Game.prefs`: `galaxies-show-drag-candidates`, default on,
      backed by a `Ui.showDragCandidates` field.
- [x] 3.2 Renderer: candidate marks in `ds.overlay` bits 11-28 (2 bits
      × 9 subcell positions), packed only during a reverse drag.
- [x] 3.3 Draw the ring around each candidate dot, emphasised on the
      snapped one, in `COL_DRAG`.

## 4. Tests

- [x] 4.1 Tier-1: click-vs-drag disambiguation both ways, including
      the `(-100, -100)` cancelled press.
- [x] 4.2 Tier-1: reverse drag commits the pair; null-move test does
      not misfire; keyboard reverse drag.
- [x] 4.3 Tier-2: rings only during a reverse drag, only on legal
      dots, absent with the preference off, erased on drag end.
- [x] 4.4 Mutation-check each new guard actually fires.

## 5. Verification and close-out

- [x] 5.1 Live Chromium, light and dark, mouse and emulated touch.
- [x] 5.2 Docs: `input.md` (click-or-drag disambiguation; consume the
      press; the third resolution to the long-press trap).
- [x] 5.2b `help/games/galaxies.md` — it documented right-drag-from-a-dot
      as the only way to place an arrow. A player-visible input change
      that leaves the help page describing the old gesture is the
      `audit-author-known-issues` defect in miniature.
- [ ] 5.3 `openspec validate --strict`; owner acceptance; archive.
