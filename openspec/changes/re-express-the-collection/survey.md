# The sweep's definition of done — a measured survey

**Measured 2026-09-06.** The owner chose the full sweep over open-ended
per-concern convergence, and the difference between those two is that a sweep
has an end somebody can declare. This file is that end: the differences across
the 57 games that **nobody can defend as belonging to the puzzle**, measured
rather than noticed, with the games named rather than counted.

The acceptance test this serves is the proposal's: *pick any two games that mean
the same thing and ask what still differs between them.* A difference that
survives must be one somebody can defend.

## The instruments, and their vacuity numbers

Every figure below carries the sweep that produced it, so it can be re-run
rather than believed.

| Instrument | Scope | Vacuity number |
| --- | --- | --- |
| `jscpd --min-lines 12 --min-tokens 90` over `src/games`, tests and fixtures excluded | exact clones | **284 files scanned**; 53 clones, 994 duplicated lines |
| Per-game file listing | structure | 57 directories |
| `Game`-object wiring grep for aliased members | naming | 57 `index.ts` |
| Local `coord`/`fromCoord` definitions vs `engine/geometry.ts` imports | idiom | 57 games, partitioned |
| Run-length encoder scan keyed on the character arithmetic | idiom | 30 games matched |

**The clone figure is a floor, twice over.** jscpd is a text instrument: it
cannot see two games that implement one mechanic with different identifiers
(Salad and Group contributed zero clone-sides to the note-taking measurement
while implementing the same mechanic), and it cannot see a difference that is
*not* duplication — a game that does the same thing a different way is invisible
to it. Batches B5 and B6 below come from reading, not from jscpd, for that
reason.

**994 duplicated lines is down from 1,262** measured on 2026-09-05, because
`unify-the-note-taking-cell` landed in between. The instrument is consistent
across the two runs, which is the only reason the delta means anything.

## The batches

Ordered by what each teaches: the ones where the shared shape is still soft go
first and harden it; the mechanical ones go last.

### B1 — the Latin family's entry arm (~380 duplicated lines, the largest cluster)

**Games:** keen, towers, solo, unequal, undead, abcd, group, mathrax, seismic,
salad, crossing. Keen is the hub — it pairs with towers (127 lines, 6 clones),
solo (92, 3), abcd (28), undead (22), unequal (19) and group (15).

**What is duplicated:** the *keyboard entry tail* that
`unify-the-note-taking-cell` did not take. That change extracted the press block
(`pressNoteTakingCell`) and two helpers (`releaseHighlightAfterEntry`,
`noOpEntryResult`); what remains copied is the block after them — the no-op
guard on "setting a square to what it already holds and no pencil marks", the
pencil decision, and the move construction.

**What legitimately differs, and must survive:** each game's own `Move` type
(a shared move type would couple save formats that have no reason to be
identical — `border-grid.ts`'s rule), and its `autoElim` / mark-all policy,
which is a puzzle fact: Keen's cages are arithmetic rather than uniqueness
regions, so a legal cage duplicate is never struck.

**Why first:** largest, and the receiving module (`note-taking-cell.ts`) already
exists with the split already argued. If the shape is going to need adjusting,
this is where it shows.

### B2 — the desc codec (`share-the-run-length-desc-scanner`, already scaffolded)

**Games:** the dialect-A run-length family — bridges, crossing, map, mathrax,
mosaic, salad, slant, bricks, boats, filling, keen, loopy, palisade.

**What is duplicated:** one grammar in four spellings (`96 + run`,
`97 + run - 1`, `97 - 1 + currrun`, `A - 1 + run`), and — the sharper half —
**written twice inside each game**: `validateDesc` scans the desc to count
squares, `newState` scans it again to fill them, each carrying its own copy of
the arithmetic. This also accounts for the scattered `state.ts` clones jscpd
found (slant~tents 21, bricks~rome 23, singles~undead 19, bricks~clusters 21).

**Already has its own change**, with a task 0 that sizes it on two games before
committing to a shape. Do not fold it in here.

### B3 — the coordinate pair

**Games:** the 36 that define their own `coord`/`fromCoord`, against the 10 that
import `engine/geometry.ts`.

**What differs indefensibly:** the *idiom*, not the border. Four games write
`Math.floor((v - b + ts) / ts) - 1` where the engine's `fromCoord` is
`Math.floor((v - b) / ts)` — mathematically the same function, transcribed from
C's truncating-division macro that TypeScript does not need. Rome, blackbox and
undead each use a third and fourth spelling (`Math.trunc`, with per-axis offsets
that differ from each other by one).

**What legitimately differs and stays:** the border itself. A clue margin, a
negative gutter that bleeds dominoes to the canvas edge, and Galaxies' full-tile
dot ring are puzzle facts. `unify-the-board-origin` already made each game's
border *one* function; this batch makes the arithmetic around it one function
too.

### B4 — the render layer's residue

**Pairs jscpd names:** clusters~sticks (43), inertia~sokoban (23),
undead~unequal (22), map~tents (20), group~towers (18), bricks~unruly (14),
keen~towers (14), abcd~keen (28).

**Treat this one most carefully.** `border-grid.ts`'s doc comment already warns
that a loop over `w*h` that reads a flag and draws a line resembles its
counterpart in any grid game here, and that unifying *that* would couple two
renderers with no reason to move together. The test is not "is this the same
text" but **"would a change here have to happen in both games at once?"** Expect
this batch to decline more pairs than it takes, and record each decline with its
reason.

### B5 — structure: where a concern lives

**From reading, not from jscpd.**

- **Four games keep their renderer in `index.ts`** where 53 keep it in
  `render.ts`: flip (944 lines), pegs (1,114), fifteen (600), sixteen (1,438).
  Three of those are among the largest `index.ts` files in the collection, and
  no reason for the difference belongs to the puzzle.
- **Five games alias a capability into the game object** rather than naming the
  function for the member it implements: boats (`findBoatsMistakes`), crossing
  (`findCrossingMistakes`), salad (`saladFindMistakes`), bridges (`flag`), and
  netslide (`netslideHint`). Each alias is one more key a cross-game scan has to
  know about, and `AGENTS.md` § "Method" already lists exactly these as the
  reason its scans must key on shape rather than on a name. **The brief
  documents the hazard; this batch removes it.**

### B6 — the sliding-tile family

**Games:** fifteen~sixteen (40 duplicated lines), plus net~netslide (21) and
twiddle, which jscpd sees only partially.

Small, and it overlaps B5 (fifteen and sixteen are two of the four games with no
`render.ts`). Do it after B5 so the files exist to unify.

### Not in scope: intra-game duplication

jscpd also found four games duplicating *themselves*: subsets `solver.ts` (75
lines, 4 clones), solo `solver.ts` (68, 3), unruly `solver.ts` (16), mosaic
across `index.ts`/`state.ts` (14). That is real and worth fixing, but it is not
what this change is: nothing about it makes two games disagree, so it neither
manufactures a fork in the road for a reader nor belongs in a convergence sweep.
**Filed separately or not at all — do not let it inflate a batch.**

## What "done" means

The sweep is done when B1 and B3–B6 are archived, B2 has reported (it may
legitimately decline), and re-running the instruments above produces:

- no clone cluster above ~20 lines that a reader cannot defend as belonging to
  its two puzzles;
- 57 games whose renderer lives in `render.ts`;
- no aliased capability wiring;
- one spelling of the pixel↔cell conversion.

A concern discovered after this list still gets fixed — but it is an addition to
a named list, not a reason the list was the wrong idea.
