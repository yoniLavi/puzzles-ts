# reduce-colour-role-variation

## Why

`unify-board-background` closed the one colour split that no game had chosen —
raw versus `mkhighlight` backgrounds — at the engine boundary. The census it
took of all 57 games' `colours()` (reproduced in `design.md`) found the rest of
the collection's colour variation, and most of it is the same shape:
**several games meaning one thing to the player and resolving it to different
colours, with no reason recorded at the assignment.** The palette's own rule
(`palette.ts`, "A game references a *meaning*") is being followed for the roles
the audit named and skipped for the ones it did not.

Every item below is player-visible, so none was folded into the boundary fix:
each wants its own decision and its own look in Chrome. They are grouped by
how clear the call is.

## What changes

### A. One meaning, one role — mechanical, no design question

- **Cursor**: seven games pick a non-default cursor colour with no reason at the
  assignment (Spokes `PURPLE`, Blackbox `RED`, Mosaic `PINK_WASH`, Guess `INK`,
  Untangle `GREY`, Pegs `BLUE_WASH`, Boats ink/paper two-tone); three more
  (Filling, Light Up, Signpost) derive `bg × 0.5` under three names; Bridges'
  cursor is the board-relative warm tint that `DRAG_ADD`'s doc declares
  unusable and that Galaxies was already moved off. Each either becomes
  `CURSOR` or says in one line why its board has spent green.
- **Held / drag**: Signpost writes `GREEN` for `HELD`'s meaning; Crossing writes
  `BLUE` on a slot named `COL_HELD`; Pegs and Untangle write `BLUE`/`BLUE_WASH`
  for `DRAG_ADD`/`DRAG_REMOVE`'s exact meaning.
- **Hint roles**: Undead writes `TEAL_BOLD` where `HINT_EVIDENCE` is the role
  (the "two names holding one value" failure `palette.ts` documents); Light Up's
  `COL_HINT_DARKREF = ORANGE` where Pattern and Singles use `HINT_WHITEREF` for
  the same premise; Untangle's `COL_HINT = ORANGE` and Clusters' `PURPLE` carry
  no reason where every other hue departure argues its case.
- **Black/white tiles**: Light Up and Singles use `INK`/`PAPER` (inverts) where
  Pearl, Pattern, Mosaic, Bricks, Inertia, Mines and Guess use `BLACK`/`WHITE`
  (pinned). Light Up's `augmentation.ts` override `{2: [0.5,0,0], 3: [0.95,0,0]}`
  exists only to undo that choice. Unruly's two bases carry no dark value, and
  its six-index `false` override exists only for that.
- **Small one-offs**: Boats' text-on-error is `PAPER` not `ERROR_TEXT`; Mines'
  digit 8 is `GRID_MID` (a grid-line meaning) where it wants `GREY`; Pattern's
  `COL_CURSOR_GUIDE = GREY` four lines below `UNDECIDED = GREY`; Filling's
  region-correct is `bg × 0.9` where `correctRegionColour` is `bg × 0.75`.

### B. One meaning, several derivations — needs a role, then a sweep

- **"This clue is done"** has five encodings: `clueDoneColour` (Magnets, Towers,
  Undead), `GREY_WASH` (Boats), `GREY` (Mosaic), `spokesSatisfied` (Spokes),
  `INK` (Loopy's `COL_SATISFIED`). Loopy and Spokes both name the slot
  "satisfied" and land on opposite ends of the scale.
- **Grid lines**: `INK` (~25 games), `GRID_MID` (3), `GRID_DARK` (5),
  `lowlight` (2), and thirteen bespoke derivations (`×0.9`, `÷1.5`, `×0.8`,
  `×0.5`, `÷1.3`, `×0.7`, mixes). Some are a game's genuine identity; most are
  what the C happened to write.
- **Duplicate arithmetic in `palette-games.ts`**: `bg × 0.5` under seven names
  for four meanings; `bg × 0.9` under five; `bg ÷ 1.5` under three, one of
  which is the shared `clueDoneColour`. Each name that means what an existing
  role means becomes that role; each that means something new becomes one.

### C. The flash — a design decision, not a sweep

Eight flash conventions: a white fill (`PAPER` or the mkhighlight highlight —
one convention now that the board is one tone), a three-phase bevel wave,
the lowlight, `highlightWash`, `COL_GRID`, a scaled background, a named colour,
a state swap, or nothing. Upstream Palisade's flash is the mkhighlight
*lowlight* (`game_mkhighlight(fe, ret, COL_BACKGROUND, -1, COL_FLASH)`); the
port wired the highlight. A collection-wide "solved" cue is the kind of
player-facing convention this fork exists to add; whether it is one flash
style or a per-family one is the owner's call.

### D. Remaining `darkMode.paletteOverrides` (8 games)

Light Up's and Unruly's fall to A. Flood's `{1: false}` and Galaxies' `{6: 0.8}`
and Solo's `{2: 0.8}` each pin an `INK` that should not fully invert — a role
question (is a region separator `BLACK`, and does a grid want a step below ink?),
not a dark-mode need. Bricks' and Mines' background halves fall away with the
board unified. Pearl's `{0: 1.15}` is a genuine scheme tweak with no token to
carry it, and is the one entry that may stay.

## Order and acceptance

A first (mechanical, each a one-line diff plus a look in Chrome in both
schemes), then D as the overrides fall out, then B, then C as its own
proposal. Every item is player-visible and so needs the owner's look, but A
and D change what a player sees only where the current value was an accident;
B and C change conventions and want the decision stated before the sweep.

## What replaces the assurance

Nothing byte-matched is involved; `palette.test.ts`, `palette-source.test.ts`,
`colours.test.ts` and `colour-dark-check` already measure every rule a swept
game has to keep, and each sweep adds the swept slot to the cross-game guard
that fits it (a "cursor is `CURSOR` or says why" scan on the shape of the
assignment, keyed on the shape and classified rather than narrowed).
