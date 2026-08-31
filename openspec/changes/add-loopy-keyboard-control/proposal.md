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
(`audit-input-mode-parity` design D4). Loopy's input is per-**edge**, so an edge
has no row and no column to arrow between, and the number of edges meeting at a
vertex is not fixed. Somebody has to decide what an arrow key *means* there.

**And the difficulty is not where this proposal first put it.** It named the
aperiodic tilings, which turns out to be exactly backwards: measured across all
23 presets, around three quarters of the vertices on Hats and Spectres have
degree 2 — the most forgiving case there is — while the **triangular** grid puts
six edges at one vertex against four arrow keys. The rule in `design.md` is
shaped by that, and the reachability hole it closes is on the triangular grid,
not on a Penrose patch.

**Slide is the worked precedent** (`2026-08-26-add-slide-keyboard-control`), and
its lesson transfers: do not model the keyboard as a second way to do the thing,
model it as a second way to *reach* the thing the pointer already reaches. Loopy
already has nearest-edge hit testing and an absolute set-this-edge move; what it
needs is a cursor that can select the same edges, not a second input path.

## What Changes

- **Design what an arrow key means on an edge** — **settled 2026-08-31, see
  `design.md`**, on measured evidence rather than taste. Dot degree was swept
  across all 23 presets: it **never exceeds 6**, and the aperiodic tilings are
  the *easy* case (~75% degree-2 dots), not the feared one. The cursor is a
  **dot**; an arrow picks the incident edge nearest in angle, and a repeat press
  takes the next — which is what makes edge coverage provable, because plain
  angular-nearest strands an edge on the triangular grid from **both** its
  endpoints.
- **Bind Enter and Space to the left and right mouse buttons.** Note the
  correction this makes to the original plan: it assumed the keyboard would need
  the three-state cycle the stylus needs. It does not — `wantsStylusModifier`
  exists because a *finger* has no second button, and a keyboard has two keys,
  so it mirrors the mouse directly.
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
