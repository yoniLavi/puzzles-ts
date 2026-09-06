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

### B1 — the Latin family's entry arm — **DISSOLVED on inspection, 2026-09-06**

> **This batch was scoped at ~380 duplicated lines and is worth about nine
> comment blocks.** The correction is kept in place rather than deleted, because
> *how* jscpd oversold it is the reusable part.

**What it was scoped as:** the keyboard entry tail that
`unify-the-note-taking-cell` left behind, across keen, towers, solo, unequal,
undead, abcd, group, mathrax, seismic, salad and crossing.

**What it actually is.** Re-measured at the note-taking module's own thresholds
(≥10 lines / ≥70 tokens over the eleven `index.ts`): 18 clones, 354 lines —
which agrees with the figure `note-taking-cell.ts`'s doc comment already
records, so nothing had drifted. Read, the 354 decompose as:

| Portion | Lines | Verdict |
| --- | --- | --- |
| **Import lists** (keen~solo 34+30, keen~towers 22, group~keen 14) | ~100 | **Instrument artifact.** An import block is not duplication; there is nothing to extract. |
| **The move literal and its two predicates** | ~72 | **Already declined**, with the reason, in `note-taking-cell.ts`'s own doc comment: lifting it means a shared `Move`, which couples save formats that have no reason to be identical. |
| **`executeMove`'s `pencilAll` / `pencilStrike` arms** | ~78 | **Not extractable.** The loop only *looks* uniform. Six games write one scalar mask; Seismic's mask is per-cell (`areaBits(dsf.size(i))`); Salad's depends on the hole type and carries a legacy `markAll` variant; ABCD's notes are a candidate *cube*, `n` slots per cell; Undead's emptiness test is `guess[i] === MON_NONE`. A shared form needs three callbacks and a count, and is **longer at the call site than the loop it replaces** — the contortion the guardrails forbid. |
| **Hint plumbing and `findMistakes`** (group~towers, group~keen, keen~towers) | ~70 | Candidate-hint plumbing over each game's own arrays; same verdict, less sharply. |
| Cursor-move fallback, misc | ~34 | Per-game. |

**What is genuinely shared and should not be:** the *rationale*, not the code.
The paragraph explaining why mark-all is additive — *"fill only the cells that
have no notes yet, never reset one the player has narrowed"*, three of the
copies naming the owner report and its date — is written **nine times**. That is
a correctness rule with nine statements of itself: change the rule and eight of
them lie. It belongs once, beside `adaptiveMarkAll`, cited from the games. That
is the whole of B1.

**The lesson, which is the reusable part.** This file's own instrument caveat
warned that jscpd *under*-reports. It does, and it also **over**-reports, in two
ways that both look like real batches: it counts import blocks, and it counts
loops that are textually identical while their per-game bodies are the entire
content. **A clone cluster is a place to look, never a finding.** The check that
settles it is `border-grid.ts`'s, and it has to be applied by reading: *would a
change here have to happen in every copy at once?* For these loops the answer is
no — a change to Seismic's mask has nothing to say to ABCD's cube.

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
- **Four games alias a capability into the game object** rather than naming the
  function for the member it implements: boats (`findBoatsMistakes`), crossing
  (`findCrossingMistakes`), salad (`saladFindMistakes`) and netslide
  (`netslideHint`), each defined in the game's `solver.ts` or `hint.ts`.
  `AGENTS.md` § "Method" lists exactly these names as the reason its scans must
  key on shape rather than on a name.

  > **Corrected 2026-09-06: this said five, and the fifth was a comment.** The
  > scan reported `bridges: flag` from the line
  > `// --- findMistakes: flag player bridges the unique solution can't support ---`.
  > Bridges' function is called `findMistakes`, like the other 37. A scan for
  > `member: name` cannot tell a wiring line from a prose line that happens to
  > contain a colon — **the same failure this file's B1 correction is about, in
  > a second instrument**, caught before acting rather than after.

  **Note what this batch is not for.** The fix for a scan that keys on a name is
  to key on shape, and the repo already does that. These four are worth renaming
  for the *reader*: Boats and Abcd both find mistakes, and a reader learning the
  collection from its corpus meets two conventions for one thing. That is the
  fork in the road the sweep exists to remove, and it is the whole of the
  argument — the value is modest and should not be oversold.

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

**B1 is closed as dissolved** — its nine rationale copies are folded into the
first executed batch. The sweep is done when B3–B6 are archived, B2 has reported
(it may legitimately decline), and re-running the instruments above produces:

- no clone cluster above ~20 lines that a reader cannot defend as belonging to
  its two puzzles;
- 57 games whose renderer lives in `render.ts`;
- no aliased capability wiring;
- one spelling of the pixel↔cell conversion.

A concern discovered after this list still gets fixed — but it is an addition to
a named list, not a reason the list was the wrong idea.
