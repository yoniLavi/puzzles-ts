# Change: Galaxies association drags — reachable from the left button, and from a cell

## Why

Owner acceptance of `fix-galaxies-drag-preview` (2026-08-08) raised two
questions the preview fix had not touched, and both are about the
gesture being **reachable** rather than about how it looks:

1. *"I don't understand why the decision was made to use the right
   button for this, as there's no other affordance attached to a drag
   on the left button. Am I missing some good reason?"* — No. Upstream
   `galaxies.c`'s own `interpret_move` header specifies *"Associate
   space with dot (**left-drag from dot**)"*, and the code has used the
   right button since the puzzle's first commit (`e137ad8`) with no
   rationale recorded anywhere. In this frontend the right button is
   also the strictly worse choice: it needs `contextmenu` suppression
   plus pointer capture to work at all, and on **touch** it is reachable
   only through `detectSecondaryButton`'s 350 ms / 8 px long-press —
   which `docs/games/input.md` already records as fatal to
   press-and-drag gestures, *"precisely when the player pauses to aim"*.
   So the collection's one cell↔dot notation is, on a phone, hidden
   behind a hold-still-then-drag gesture nothing advertises. That fails
   the input-parity bar (owner directive, 2026-08-03).
2. *"We should allow dragging both from the circle, as now, and from a
   cell to a circle, highlighting the possible circles."* — The drag is
   currently one-directional: you may take an arrow **to** a cell, but
   a player looking at a cell and asking "which dot owns this?" has no
   gesture. That question is the game's central deduction, and it is
   the natural thing to want to express.

## What Changes

- **The left button gains the association drag.** A left press that
  releases without travelling more than a few pixels toggles an edge,
  exactly as today; a left press that travels starts an association
  drag. The edge toggle therefore commits on **release** rather than on
  press — the unavoidable cost of putting two gestures on one button,
  and the reason upstream never did. Right-button drags are unchanged,
  so both mouse muscle memory and the touch long-press path keep
  working.
- **A drag may start from a cell and aim at a dot.** Pressing an
  unassociated, dot-free tile begins the reverse drag: the cell stays
  put and the *dot* is what the pointer picks, snapping to the nearest
  dot that a release could legally associate this cell with. The
  existing preview renders it unchanged — it is the same (tile, dot)
  pair with the roles swapped. A press on a tile that already carries
  an arrow keeps today's "pick that arrow up and move it" meaning.
- **The dots a cell could legally join are ringed** while such a drag
  is in progress, and the snapped one is emphasised. This is a genuine
  solving aid — "which dots have a legal 180° image for this cell" is a
  deduction players otherwise make by hand — so it sits behind a new
  per-game preference, `galaxies-show-drag-candidates`, defaulting on.
  The **gesture** is never gated; only the highlight is.
- Keyboard parity throughout: `CURSOR_SELECT` on a plain tile starts
  the reverse drag, the cursor keys pick the dot, and a second select
  commits.

## Impact

- Affected specs: `galaxies` (MODIFIED: the play requirement gains the
  left-button and cell→dot gestures; the rendering requirement gains
  the candidate rings).
- Affected code: `src/games/galaxies/{index,render,moves}.ts`,
  `galaxies.test.ts`.
- Player-facing: `help/games/galaxies.md`, which documents
  right-drag-from-a-dot as the only way to place an arrow.
- Docs: `docs/games/input.md` (the aim-drag section gains the
  click-or-drag disambiguation this needs, and the "touch hold arrives
  as the right button" trap gains its third resolution: *put the
  gesture on the left button so the promotion never has to happen*).
