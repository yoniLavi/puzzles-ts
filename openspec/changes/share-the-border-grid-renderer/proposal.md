# share-the-border-grid-renderer

**Readiness: ready.** Measured 2026-09-05, immediately after
`unify-the-note-taking-cell`, by classifying every cross-game clone in the
collection rather than picking a target from memory.

## Why

**`border-grid.ts` shares Palisade and Separate's model and their input. Their
*renderer* is still written twice, and it is the same renderer.**

`diff palisade/render.ts separate/render.ts` is 15 hunks over 709 lines, and
every function heading matches except the two params types and one Palisade
extra. jscpd's exact-clone count understates it at 205 lines because most of the
rest differs only in an identifier. What is byte-identical includes the parts
that are least incidental:

- **The error model.** "A region larger than `k`, a region smaller than `k`, or
  a wall that separates nothing" — computed each frame from the two DSFs (black
  = wall-separated, yellow = no-wall) into per-edge error bits. Twenty-odd lines,
  identical, and it is the *mechanic's own rule*: change what counts as a wrong
  wall and both games change together or one of them is wrong.
- **The half-grid cursor.** `drawCursor` is identical, and the cursor it draws
  is the one `border-grid.ts` already owns the movement of (`moveBorderCursor`).
  The module moves the cursor and the games draw it, twice.
- **The four edge rects**, keyed off the border bits `border-grid.ts` defines.
- **The geometry** — `tileWidth`, `margin`, `center`, `computeSize` — of which
  `margin` is *already* in `border-grid.ts` and re-derived in both renderers
  anyway.

## The decision this removes

Judged by AGENTS.md § "Convention over configuration": *can we say what a game
would legitimately want to do differently?*

- **"What does a wrong wall look like, and when is a wall wrong?"** Neither game
  answers that about *its* puzzle — Palisade counts a cell's walls and Separate
  fixes region sizes, and both of those live in the clue layer, not here. The
  error model below them is one rule.
- **"How is the half-grid cursor drawn?"** No game has an answer of its own; the
  cursor is the shared mechanic's.

**What must stay with each game**: the clue layer and everything downstream of
it. Palisade draws a digit and has an explained hint with its own edge and cell
marks; Separate draws a letter, shades regions, and reddens a letter repeated
within its region. Those are the puzzles, and they do not move.

## Reopening a decline, and why it is not a reversal

`border-grid.ts`'s header declines exactly this: *"WHAT DOES NOT live here is
code that merely looks alike. A loop over `w*h` that reads a flag and draws a
line resembles its counterpart in any grid game in this collection; unifying
that would couple two renderers with no reason to move together."*

That sentence is right about what it describes and does not describe this. A
`w*h` loop that reads a flag and draws a line *is* generic. The error model, the
border bits and the half-grid cursor are not: they are the rendering of the
mechanic the module already owns, and the module's own test — *would a change
here have to happen in both games at once?* — answers yes for each of them. The
decline was made when only the input had moved; what changed is that the
question was asked again with the renderers side by side.

The generic half of the decline survives verbatim and stays in the header.

## What changes

- The flag vocabulary becomes one bit layout. The two games currently differ
  (Separate's `F_CORRECT` is bit 23, Palisade's bit 28, because Palisade
  reserves 23–27 for hint bits). **Nothing persists these**: they live in
  `ds.cache`, a draw-state cache rebuilt from scratch, so the layout is free to
  move. Confirm that before relying on it.
- The error model, the edge rects, the cursor and the geometry move.
- Each game keeps its own palette indices, its clue drawing and its overlays.

## Impact

- Affected specs: `ts-engine` (the shared mechanic), possibly `palisade` /
  `separate`.
- Affected code: `src/engine/border-grid.ts` (or a sibling — decide from the
  resulting size; the module is 341 lines today),
  `src/games/{palisade,separate}/render.ts`.
- **Player-visible, and the bar is that it is not.** This is a pure extraction:
  the draw calls, their arguments and their order must be identical, so both
  games' render snapshots pass **byte-clean**. A re-baselined snapshot means
  pixels moved and the extraction is wrong. That is a sharper net than the
  note-taking cell had, because rendering is exactly what tier-2.5 captures.
