# Design

## Context

Galaxies state today: tiles carry `F_TILE_ASSOC` + dot coords; the op union
is `edge` / `unassoc` / `hold` / `assoc` (batched as ops inside one move);
right-press/drag/release drives committed association; left-click toggles
the nearest edge; **left-drag and left-release are deliberately unwired**
(recorded in `index.ts`'s input comment) — that free surface is what this
change spends. Mistake detection re-solves a dots-only copy and flags wrong
tiles and intra-region walls.

## Goals / Non-Goals

- Goals: a pencil-grade "must belong to dot D" mark per tile; three input
  modes; honest rendering (never confusable with a committed arrow);
  mark-aware mistake checking; groundwork vocabulary for `add-galaxies-hint`.
- Non-Goals: negative marks ("cannot be dot D") — see D1; any engine/shared
  machinery (deliberately per-game; what generalises poorly is *recorded*
  for the framework substrate, not pre-abstracted); mark-all semantics
  (`canMarkAll` stays unset — there is no useful "fill all candidates" for
  entity-valued marks, where the plausible dot set per tile is small and
  positional).

## Decisions

- **D1 — Positive marks only, one per tile.** The owner's ask is "must be
  connected to a particular dot". A full candidate-set model (strike out
  dots per tile) is the digit-family shape transplanted badly: a board can
  have dozens of dots, almost all irrelevant to a given tile, and there is
  no natural gesture for striking. One positive assertion per tile, toggle
  to remove, re-mark to replace. If the hint work later needs "ruled-out"
  vocabulary it narrates it (evidence highlights) without requiring the
  player to draw it — the Dominosa precedent inverted
  (`docs/games/hints.md § "Rule-outs as board marks"` is the pattern to
  consult, not necessarily to copy).
- **D2 — Marks are state, not Ui.** Undoable, serialised via the move log
  (the ops array is already structured-clone-safe; `mark` adds
  `{ kind: "mark"; x; y; ax; ay }` in the same doubled-grid coordinates as
  `assoc`). Pencil marks that vanish on undo/save would violate the
  note-taking conventions every pencil game follows.
- **D3 — Gesture: left-drag connects tile and dot, either direction; a
  plain left click stays an edge toggle.** Disambiguation is by drag
  threshold: a left press followed by release without leaving the press
  cell's neighbourhood is today's edge toggle, unchanged; crossing the
  threshold enters mark-drag with a live preview ghost, and release commits
  the mark iff the drag connects a tile and a dot (in either order —
  matching the committed gesture's symmetry). Releasing anywhere else
  cancels. `changedState` must cancel a dangling mark-drag
  (`docs/games/rendering.md § "changedState cancels a dangling drag"`), and
  the preview must not look like a committed mark
  (`docs/games/rendering.md § "A press preview must not look like a
  commit"`). Touch: the same drag works via the stripped-stylus default;
  verify the long-press promotion does not steal the gesture
  (`docs/games/input.md § "A touch hold arrives as the right button"` —
  Galaxies gives the right button meaning, so the drag must key off the
  button *class*, not the press code). Keyboard: reuse the existing
  cursor+select association flow with a pencil variant — the implementing
  session picks the exact binding against what `interpretMove` already
  handles, with the parity bar as the constraint: **all three modes must
  create, replace, and remove a mark.**
- **D4 — Committed truth absorbs pencil truth.** An `assoc` op on a tile
  clears that tile's mark in the same `executeMove` (one truth per tile);
  the solver op (`s`) clears all marks. `unassoc` does not resurrect a
  mark. This mirrors how digit games clear a cell's notes on placement, and
  it is load-bearing for `add-galaxies-hint`'s `refreshHintStep` semantics.
- **D5 — Rendering: a parallel cache plane, not key bits.** A mark's
  payload (dot coordinates) exceeds spare key bits; store per-tile mark
  identity in its own plane compared in the cache-miss test, exactly the
  Solo pencil-plane shape (`docs/games/rendering.md § "The tile cache and
  the diff key"`). Visual: a pencil-grade ghost pointing from tile toward
  its marked dot, sharing the *committed* arrow's geometry but
  unmistakably lighter (hollow / `pencilColour(bg)`-tinted per the palette
  meanings — no new colour value; `docs/games/rendering.md § "The palette:
  three layers, meaning first"`). The mark-mistake overlay reuses the
  existing mistake sidecar discipline and needs the paint-twice test
  (`docs/games/rendering.md § "Prove the overlay repaints"`).
- **D6 — Mistake semantics.** A mark on tile T naming dot D is a mistake
  iff the unique solution assigns T a different dot — flagged as
  `{ kind: "mark"; x; y }`, rendered as the tile-mistake highlight applied
  to the ghost, blocking Check & Save through the existing gate. Extra
  correct marks are ordinary mid-solve state. The solution is derived from
  the dots-only re-solve exactly as today — never from marks (a mark can
  be wrong; that is what is being checked).

## Risks / Trade-offs

- Left-drag threshold vs edge-toggle precision → the threshold only
  matters on tiles (edges are click-targets); tier-1 tests pin both sides
  of the boundary.
- Touch long-press stealing the drag → keyed off button class (D3);
  covered by the automatic touch guard plus a targeted test.
- A mark visual too close to a committed arrow → tier-2.5 assertions that
  the two emit distinguishable ops (colour + fill differ), plus owner
  acceptance which is the real arbiter of "reads as pencil".

## For the framework record (do not implement here)

Entity-valued candidates and the two-entity drag gesture are new substrate
requirements; whatever fits poorly in this per-game implementation gets a
note in the change's close-out for `docs/framework-rdd/deduction.md` /
`game-definition.md`.

## Migration Plan

Pure addition: no desc/params change, no save-format break (old saves have
no `mark` ops; new saves replay fine on this version). No differential
impact (marks never touch generation).

## Open Questions

- Exact keyboard binding (D3) — implementing session decides against the
  live `interpretMove`, records it here.
