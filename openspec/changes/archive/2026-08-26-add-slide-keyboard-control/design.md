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

**Settled: one cell per press.** The two options are not in fact both
defensible. Slide-to-the-end cannot stop *inside* a corridor, so the set of
cells it can reach is a strict subset of the reachable set — a keyboard player
could not park a block mid-corridor, which the drag does trivially. That is the
same objection this section already uses to reject the free cursor, and it
decides the question without needing a taste call. Said so in the help page.

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
(docs/games/input.md § "The numeric keypad never arrives"). That trap is already handled in `isStepKey` and must not be
undone.

**It caught the *cancel* key, which was the same trap one layer down.** The
model above needs "put the block back", and the collection's key for that is
Escape. Escape never reached any game: `handleKeyEvent` swallowed it whether or
not there was a gesture to cancel. Pearl and Rectangles each ship a
`button === 27 || button === 8` cancel arm in which **neither** code can arrive
— 27 because the frontend eats it, 8 because this key map sends 127 for
Backspace. So Slide's cancel key would have been born dead, exactly like
upstream's space.

The repair is in the frontend rather than in Slide, because repairing it in
Slide alone would leave three games each testing a code nothing sends: Escape
now reaches games as button 27 whenever no pointer gesture is in flight, and the
two existing arms accept 127. It is a new `app-shell` requirement, and it is in
this change rather than deferred to `audit-input-mode-parity` because that audit
is the *sweep* and this was already inside the blast radius of the work.

## D3. Do not fold the new keys through `asPrimary`

`interpretMove` opens by folding `RIGHT_*` onto `LEFT_*` (`asPrimary`), because
`detectSecondaryButton` delivers a stationary touch as `RIGHT_BUTTON` and that
would otherwise kill "press, pause to aim, then drag" (docs/games/input.md § "A touch hold arrives as the right button"). That fold
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

**Settled — and the question turned out to be malformed.** It asks which of two
states should drive the renderer, when there are not two states. A block picked
up by a pointer and a block picked up by the keyboard are *the same block, held*;
nothing downstream of the grab needs to know which hand did it, because both feed
`computeReachable` and both end in `{ kind: "move", from, to }`. So there is one
grab, reached two ways, and the drag fields become the grab fields — renamed,
because `ui.dragging` set true by a keypress is false documentation, and the lie
propagates into `FG_DRAGGING` and `COL_DRAGGING` behind it.

That leaves the cursor, which is genuinely a second thing and is kept apart:

- **`cancelGrab` drops the grab and nothing else.** The grab dies with the board
  it was computed against — the reachable set is stale however the block was
  picked up, which is the "may be right" horn above, and it is right for the
  reason stated rather than by inheritance from the drag.
- **The cursor survives**, being a position on a grid whose size has not changed.
  Clearing it too is exactly the failure mode this section warned about.

One consequence had to be handled that neither horn anticipated: with a single
grab state, a **pointer press that grabs nothing** would leave a keyboard grab
live under a pointer, and the next `LEFT_DRAG` would fling the held block at it.
So a pointer press now takes the board over — it hides the cursor, and where it
grabs no block it puts down whatever was held. This is also the honest reading of
the gesture ("you clicked somewhere else"), and it removes the need for a
grab-origin flag entirely: during a `LEFT_DRAG` the grab is always a pointer
grab, by construction.

## D4. Rendering: the cursor must be legible against the drag preview

`render.ts` already draws the dragged block following the pointer plus a landing
shadow at its snapped destination. The keyboard cursor and selection need to read
as *different* from that, not as a second drag, and must be visible at the
smallest shipped tile size.

`refine-slide-appearance` landed first (2026-08-07), so this change owns the
reconcile against a settled ladder — and the ladder is what decides the colour.

**Settled.** The grabbed block is drawn *exactly* as the drag draws it. Rendering
it differently would assert a distinction the game does not make (see D3a), and
the cursor is the mark that says "keyboard". It is the collection's four corner
brackets (`drawRectCorners`), which sit beside the content rather than over it.

**The colour is red, and the argument is about a span, not a pairing.** The
cursor is clamped to the whole grid, so it lands on every material Slide has.
Green is out on meaning: the help page names the exit green to the player, so a
green mark elsewhere would say "the exit is here" and a green mark on the exit
would vanish. Of what is left, the board's light-scheme ladder runs 0.44 (key
block) / 0.48 (wall) / 0.65 (block) / 0.83 (floor) / 0.94 (exit), which is too
wide for any mid-tone: teal, pink and orange each disappear against one end, and
yellow (0.80) disappears into the floor. So: an end of the range.

Which end is **not** stable, and this is F1 read from the other side. In dark
mode the ladder inverts — the wall and key block become the *lightest* things on
the board (0.61) and the exit the darkest (0.29). There is no flat colour at the
dark end of both schemes, so the deciding axis is **chroma**: red at equal
lightness to a neutral grey wall still reads, where a second grey would not, and
red is opposite in hue to the one saturated thing on the board rather than
adjacent to it. Purple was tried first — it is nearer the blue-violet key block
in hue and only 0.03 lighter in dark mode — and read as a smudge in the browser.

One further change fell out of looking at it: `drawRectCorners` hardcoded a
one-pixel stroke, which is sized for ink on paper and had nothing carrying it on
a board of four greys. It now takes an optional `thickness` (default 1, so no
other game moves) and Slide scales it with the tile.

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
