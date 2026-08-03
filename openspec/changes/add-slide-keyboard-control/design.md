# Design — add-slide-keyboard-control

## D1. The keyboard model: select a block, then walk its reachable set

Slide's drag is continuous — the block tracks the pointer and snaps to the
nearest reachable cell. A keyboard has no "nearest to the pointer", so the
question is what the arrow keys move.

**Rejected: arrows nudge the block one cell per press, committing each.** It
reads naturally but breaks Slide's move accounting, which is the game's whole
scoring model: *"Moving the same block again SHALL NOT increment the displayed
move count, and returning a block to where it started SHALL decrement it, so
that a multi-step slide of one block counts as a single move"* (`slide` spec).
Committing per nudge would either inflate the count or require the move-merging
rule to be re-derived on a second path.

**Rejected: a free cursor that ignores reachability**, letting the player park
the selection anywhere and rejecting the illegal ones on commit. It makes the
keyboard strictly worse than the drag, which shows the legal destinations *while
you aim*.

**Proposed: two modes on one cursor.**

- **Unselected.** The arrow keys move a cell cursor over the board, clamped to
  the grid (`gridCursorMove` in `engine/pointer.ts` — the shared bounded-grid
  clamp; Slide's grid is exactly the common case it exists for). Select on a cell
  belonging to a block grabs that block: compute `reachable` once, exactly as the
  grab does, and mark the block selected.
- **Selected.** The arrow keys move the block's anchor through its **reachable
  set** — one step per press in the pressed direction, refusing a step that
  leaves the set. Select commits (`{ kind: "move", from, to }`); Escape, or
  select on the block's original position, cancels.

That reuses `computeReachable` and produces exactly one move for a multi-cell
journey, so the move-count rule is the drag's rule with no second implementation.

**Open for implementation to settle** (either is defensible; decide with the
board in front of you): whether a *selected* arrow press should step one cell or
slide as far as the reachable set allows in that direction. One cell is more
controllable and matches the cursor's other mode; slide-to-the-end is fewer
presses on a long corridor. Whichever is chosen, say so in the help page.

## D2. The Solve step key collision is narrower than it looks

`CURSOR_SELECT`/`CURSOR_SELECT2` are already bound, via `isStepKey`, to walk an
installed Solve route. The binding is **gated on `state.soln`** — it only fires
when a route exists — so the two uses are separable without inventing a third
key.

**Proposed:** while a Solve route is installed, the step key keeps stepping the
route; the keyboard selection is unavailable, exactly as it is today. Straying
from the route already discards it (spec: *"straying from the route or finishing
it SHALL discard it"*), so the player who wants to take over gets the selection
back by making any move of their own.

The alternative — selection wins and the route needs a different key — costs a
new binding and breaks a shipped, spec'd behaviour to solve a conflict the player
can only reach deliberately.

**Check while implementing:** the step key must still be one this frontend
actually delivers. Upstream binds the space *character*, which never arrives —
`puzzleKeyMap` maps Space to `CURSOR_SELECT2` and Enter to `CURSOR_SELECT`
(playbook §3.8a). That trap is already handled in `isStepKey` and must not be
undone.

## D3. Do not fold the new keys through `asPrimary`

`interpretMove` opens by folding `RIGHT_*` onto `LEFT_*` (`asPrimary`), because
`detectSecondaryButton` delivers a stationary touch as `RIGHT_BUTTON` and that
would otherwise kill "press, pause to aim, then drag" (playbook §3.8c). That fold
is about *pointer* buttons and must not silently swallow a cursor button: check
the cursor branch sits where a folded right button cannot reach it, and add a
test that a keyboard press does the same thing whether or not a touch gesture is
in flight.

## D3a. Reuse the drag fields, or add cursor fields beside them?

`render.ts` keys its block-follows-the-pointer preview and its landing shadow
**entirely** off `ui.dragging` / `dragAnchor` / `dragCurrpos`, previewing through
`movePiece`. So a keyboard selection driving those same three fields would get
the existing preview rendering for free.

That is tempting and may well be right, but it makes `dragging` mean two things,
and `changedState` unconditionally calls `cancelDrag(ui)` — which exists so an
undo made under a held pointer cannot leave `dragAnchor` pointing at a square the
new board lacks. Cancelling a *keyboard* selection on every state change may be
wrong (the player has not let go of anything) or may be right (the reachable set
is stale either way, which is the same reason the drag is cancelled).

**Decide it explicitly and write the answer down**, either way — the failure mode
is a keyboard selection that silently evaporates after an undo, which reads as a
lost keypress.

## D4. Rendering: the cursor must be legible against the drag preview

`render.ts` already draws the dragged block following the pointer plus a landing
shadow at its snapped destination. The keyboard cursor and selection need to read
as *different* from that, not as a second drag, and must be visible at the
smallest shipped tile size.

Note `refine-slide-appearance` is an open change against the same renderer, and
it moves Slide's contrast ladder. **Whichever lands second owns the reconcile** —
do not author two independent colour decisions for the same board. Colours come
from `engine/colour/colours.ts` / `colour/palette.ts` either way, and must work in
both schemes (`hand-author-dark-palette` F1: "brightest" is scheme-relative).

## D5. What proves it works

- Tier 1: a keyboard-only sequence — cursor to a block, select, walk it to a
  legal cell, commit — produces the *same* state and the *same* move count as the
  equivalent drag. That equality is the requirement, so assert it directly rather
  than asserting the keyboard path in isolation.
- Tier 1: a selected arrow press that would leave the reachable set is refused
  and changes nothing.
- Tier 2.5: a render scenario showing the cursor and the selected block, with a
  snapshot.
- Browser (Chrome, `playwright-cli`): play a board to completion using **only**
  the keyboard. That is the actual claim, and it is the one thing the in-process
  tests cannot make.
