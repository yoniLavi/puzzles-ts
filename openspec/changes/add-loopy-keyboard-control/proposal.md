# add-loopy-keyboard-control

## Why

**Loopy is the one game of fifty-seven a keyboard player cannot play at all.**
`audit-input-mode-parity` swept the collection through the real registry and a
real `Midend`: fifty-six games respond to a cursor key and have a keyboard-only
sequence that commits a move. Loopy responds to nothing — no arrow, no select, no
erase, no cancel. That is the audit's single BROKEN keyboard cell, and its
`audit.md` is where the measurement lives.

**Nobody chose this.** Upstream's `loopy.c` contains no `CURSOR_` reference at
all, so the port inherited the absence rather than declining a cursor it had been
given. The audit records it as a defect and not an exemption for exactly that
reason: the standing bar is maximum parity between mouse, touch and keyboard
(owner directive, 2026-08-03), and an unexamined gap is not an exemption.

**It is filed rather than fixed inline because it is a design, not a binding**
(`audit-input-mode-parity` design D4). Loopy's input is per-**edge** across
eighteen tilings, several of them aperiodic, so "move the cursor to the next
edge" has no canonical meaning: an edge has no row, no column and no fixed number
of neighbours, and on a Penrose patch it has no consistent orientation either.
Somebody has to decide what an arrow key *means* there, and that is a product
decision this change owns.

**Slide is the worked precedent** (`2026-08-26-add-slide-keyboard-control`), and
its lesson transfers: do not model the keyboard as a second way to do the thing,
model it as a second way to *reach* the thing the pointer already reaches. Loopy
already has nearest-edge hit testing and an absolute set-this-edge move; what it
needs is a cursor that can select the same edges, not a second input path.

## What Changes

- **Design what an arrow key means on an edge**, once, for all eighteen tilings —
  this is the whole difficulty and should be settled in `design.md` before code.
  The obvious candidates, each with a real cost:
  - **cursor on a dot, arrows pick a direction** — an edge is then (dot,
    direction), which is how upstream's *other* loop games think, and it degrades
    gracefully on an irregular tiling because a dot always has *some* set of
    incident edges. Costs: the mapping from four arrow keys to N incident edges
    needs a rule, and on a Penrose patch N varies.
  - **cursor on an edge, arrows step to a geometric neighbour** — fewer keys per
    move, but "the edge to the right of this edge" is ill-defined exactly where
    the game is most interesting.
  - **cursor on a face, arrows walk faces, a select cycles its edges** — cheap on
    a square grid and poor on a tiling with twelve-sided faces.
- **Bind select and erase to the same three-state cycle the stylus already
  reaches** — Loopy sets `wantsStylusModifier` precisely so one tap can reach all
  three edge states, and the keyboard has the same problem and can borrow the
  same answer.
- **Render the cursor**, on every tiling, including the aperiodic ones. Loopy's
  renderer draws edges from grid geometry rather than from a lattice, so the
  cursor has to be drawn the same way.
- **Remove Loopy from `input-parity.test.ts`'s `NO_KEYBOARD` list** — that is the
  acceptance test for this change, and it is already written.
- **Update the `loopy` spec**, which currently records the absence as an open
  defect with this change named, and `help/games/loopy.md`.

## Impact

- **Affected specs**: `loopy` — its "Loopy input and rendering" requirement
  currently states the absence and points here.
- **Affected code**: `src/games/loopy/` (input, ui, render), and the
  `NO_KEYBOARD` list in `src/engine/input-parity.test.ts`.
- **Player-visible**: yes — a new control scheme, so it needs owner acceptance on
  how it *feels*, not merely on whether the keys are wired.
- **Risk**: the auto-follow preference extends a click along a forced path, so a
  keyboard select must go through the same path as a click rather than beside it
  — the Slide rule ("`grabBlockAt` and `releaseGrab` are called by the pointer
  arm and the cursor arm alike") applies directly. Test the *equality* of the two
  routes, not the new one in isolation.
