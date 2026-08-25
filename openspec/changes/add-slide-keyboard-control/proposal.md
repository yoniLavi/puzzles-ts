# add-slide-keyboard-control

## Why

**Slide is the one game in the collection with a select key and no way to move a
cursor**, and the owner's standing bar is maximum parity between mouse, touch and
keyboard. A survey of all 57 games puts it in a category of one: 53 have a real
movable cursor (two of them — Palisade and Separate — via `border-grid.ts`'s
`interpretBorderGridInput` rather than directly), three are direct-action games
where the arrow key *is* the move and no select is wanted (Cube, Fifteen,
Sokoban), one has nothing at all (Loopy), and Slide has `CURSOR_SELECT` bound to
exactly one thing that is not playing the game.

Upstream's own overview page said so out loud — *"Keyboard control is not yet
supported"* — in the `**Status:**` paragraph that
`retire-the-upstream-help-tree` (2026-08-03) removed from the served help page.
Removing it was right: a served page states how the game is played, not what is
missing from it. But the sentence was **true**, and deleting the sentence does
not close the gap. This change closes it.

The gap is currently *normative*, not accidental: the `slide` spec says
"Slide SHALL be played by mouse or touch drag only — it has no keyboard cursor",
so a keyboard player is excluded by the requirement, and a test asserting
otherwise would be asserting against the spec. That sentence is what this change
edits.

What Slide has today is a single press-and-drag gesture: grab a block, and the
game computes the set of cells that block can reach; the block follows the
pointer, snapped to the nearest reachable cell; release drops it there
(`src/games/slide/index.ts`, `moves.ts` `computeReachable`/`nearestReachable`).
`CURSOR_SELECT`/`CURSOR_SELECT2` are already bound, but **only** to walk an
installed Solve route one step at a time (`isStepKey`, gated on `state.soln`) —
so a keyboard player can follow the answer and cannot play the game.

`SlideUi` (`state.ts:224`) holds six ephemeral fields, all of them about the
drag: `dragging`, `dragAnchor`, `dragCurrpos`, `dragOffsetX/Y` and the
`reachable` mask. There is no cursor position, no selected-block field and no
show-cursor flag.

**There is no recorded argument to rebut.** `add-slide-ts-port`'s proposal lists
"No keyboard cursor" as a flat scoping line and its `design.md` gives no
rationale at all — the input discussion is entirely about the dead step key and
the long-press collision. Upstream `slide.c` has no keyboard either, so the port
inherited an absence rather than deciding one.

## What Changes

- **A keyboard route through the same move machinery.** Move a cursor over the
  board, select a block, move the selection through that block's *reachable set*,
  and commit. The reachable-set computation, the snap and the move-counting rules
  are the ones the drag already uses — this is a second way to drive
  `computeReachable` + `{ kind: "move", from, to }`, not a second movement model.
- **A visible cursor and a visible selection**, drawn in `render.ts` on the same
  terms as the existing drag preview and landing shadow. A keyboard player must
  be able to see which block is selected and where it would land.
- **The Solve-route step key keeps working**, and the two uses must not collide.
  See `design.md` D2 — the collision is narrower than it looks, because the step
  key is gated on a route being installed.
- **Spec**: `slide` gains a keyboard requirement with scenarios, and stops saying
  "mouse or touch drag only". Note *where* that sentence lives — in the **Game
  interface** requirement, not the input one, which is not where a reader looking
  for it would go. An earlier draft of this change's delta assumed the input
  requirement and would have archived a spec that announced the sentence's
  removal while leaving it in place, one requirement above.
- **Help**: `help/games/slide.md` describes the keyboard controls, in the same
  register as the games that already have them.

## Impact

- **Affected specs**: `slide`. The keyboard route is an ADDED requirement,
  "Slide is playable by keyboard". One **edit to an existing requirement** is
  also needed — write it as a `## MODIFIED Requirements` delta **when you
  implement**, copying the live text at that moment, so `openspec validate`
  checks you dropped nothing. It is to be
  made in `openspec/specs/slide/spec.md` when this change is archived, reading
  the live text at that moment:

  > In **"Slide game implements the Game interface"**, the sentence beginning
  > *"Slide SHALL be played by mouse or touch drag only — it has no keyboard
  > cursor — and SHALL declare no `findMistakes` hook…"* loses the
  > drag-only clause and keeps the `findMistakes` clause, which is unrelated and
  > still true.

  Nothing else needs editing: "Slide input, movement and completion" describes
  the pointer gesture, the move count, the Solve route, the drag cancellation and
  the rendering, and every one of those statements stays true. The keyboard's
  obligations are additions to them, which is why they are expressed as an added
  requirement rather than as a rewrite.
- **Affected code**: `src/games/slide/{index,state,render}.ts` — `SlideUi` gains
  cursor/selection fields alongside the existing drag fields; `interpretMove`
  gains the cursor branch; `redraw` draws the cursor and selection.
- **Player-visible**: yes, additively. Nothing about the mouse or touch gesture
  changes; a board reached by keyboard is the same board.
- **Not in this change**: Loopy, the *other* game with no keyboard cursor
  (`src/games/loopy/index.ts`: "Upstream gives Loopy no keyboard cursor and no
  drag"). It is a different problem — Loopy's input is per-*edge* on eighteen
  different tilings, so "where does a cursor go and how does it move" has no
  obvious answer, where Slide's is an ordinary bounded grid. It is picked up by
  `audit-input-mode-parity`, which decides the collection-wide policy; if that
  audit concludes Loopy should have one, it gets its own change.
