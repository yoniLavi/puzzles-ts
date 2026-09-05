# Postmortem: the declared gesture table, withdrawn before implementation

**Date:** 2026-09-05
**Status:** Withdrawn. `declare-the-gesture-table` is deleted; the direction is
dropped from the migration plan.
**Superseded by:** `unify-the-note-taking-cell`, scaffolded from this
exploration's actual finding.

## TL;DR

`declare-the-gesture-table` proposed replacing each game's hand-written
`interpretMove` with a **gesture table** — pointer gesture → move constructor,
drawn from a named library — from which keyboard and touch equivalents would be
**derived**, turning the input-parity bar from an audit obligation into a
resting state and handling the four frontend traps once.

Its task 0 was an exploration with a named falsifier. The exploration ran: all
57 `interpretMove` bodies were read (6,672 lines), the corpus was classified by
gesture *shape*, and the falsifier was tried first as the task list required.
**Three of the change's own disqualifying conditions fired**, and a fourth
condition — the one the scene-graph postmortem set for any framework-scale
pivot — was never met.

1. **The falsifier fired.** Sixteen's input decomposes into six arms; two are
   library-shaped and four are not, and the four carry ~155 of its 262 lines.
2. **The headline benefit had already shipped**, by derivation rather than
   declaration, in the change this proposal cites as its evidence.
3. **The table would be escaped by more games than it serves** — the proposal's
   own stated test, measured at 14 clean, 14 hatched, 29 partial.
4. **There is no downstream game pressuring it.** Both greenfield pilots are
   deferred and one is marked "much later, or not at all".

What the exploration *did* find is a large, well-founded duplication that is
**family-shaped rather than gesture-shaped**, and it is filed as its own change.

## What was proposed

From `docs/framework-rdd/game-definition.md` § "Moves and gestures":

> **You declare:** the move union … and a **gesture table**: pointer gesture →
> move constructor (click cycles, drag paints accretively, right-click marks,
> press-picks-transformation, …), drawn from a named library of the gesture
> shapes the collection has already needed.
>
> **You get:** `interpretMove` assembled from the table; **keyboard and touch
> equivalents derived by default** … The four frontend traps … are handled once,
> in the library.

The proposal rated this "the piece with the highest ratio of decisions-removed
to framework added", on the grounds that the parity obligation is already
collection-wide and only its *satisfaction* is per-game.

## What the exploration did

- **Read the whole population**, as task 0.2 required: 57 `interpretMove`
  bodies, 6,672 lines, keyed on shape rather than on the name `interpretMove`.
  That key matters — the first extraction pass, keyed on the bare name, reported
  Untangle as having no `interpretMove` (it is an arrow-function property) and
  Ascent as having a 10-line one (it delegates to `interpretAscentMove` in
  `ui.ts`). Both would have been silently absent from every figure. Widening to
  `interpret*Move` and taking the longest body per game gives 57 of 57.
- **Tried the falsifier first**, as task 0.4 required, rather than last.
- **Re-read `audit-input-mode-parity`'s `audit.md` for what it measured**, not
  as though it answered this question — and then checked the *live* guards
  rather than the audit's account of them.
- **Measured the duplication** the corpus actually carries, with `jscpd` over
  `src/games` (284 files scanned, so the sweep was not vacuous).

## Finding 1 — the falsifier fired

`migration.md` names the condition and the test:

> The derived gesture layer cannot express a real game's input without more
> declaration than the `interpretMove` it replaces (Sixteen's drag-to-slide is
> the test).

Sixteen's 262-line `interpretMove` decomposes into six arms:

| What the player does | Expressible as a library gesture? |
| --- | --- |
| Drag a row or column of tiles; the release commits `round(distance / tilesize)`, wrap-normalized into ±½ the line length | **Yes** — a slide-follow drag. Sixteen is its only consumer: Slide's follow-drag carries one block over a precomputed reachable set, and Netslide has no drag at all. |
| Click the gutter beside a row or column to slide it | **Yes** — a gutter press, with four consumers (Sixteen, Netslide, Group's legend, Blackbox's edge cells) and four different geometries: Netslide's `+2 … −2` shuffle that keeps C's truncation, Blackbox's `(w+2)×(h+2)` with four excluded corners, Group's `point + ts/2` edge index. |
| Enter / Space toggles one of three cursor lock modes | No |
| An arrow *is* a slide when locked or modified, and the axis and delta come from comparing a clamped `gridCursorMove` against a wrapping one | No |
| The unlocked cursor walks a ring one cell outside the board, transposing between the row-ring and the column-ring at each of four corners | No |
| A select on a border cell means the gutter click rather than the mode toggle | No |

Two of six arms are library-shaped; the other four are ~155 of the 262 lines and
are not incidental — the three lock modes **are** Sixteen's keyboard design. So
the table would express under half of one game while adding a declaration layer
*and* a hatch for the rest.

**Why this generalizes past Sixteen.** The proposal's load-bearing claim is that
a gesture brings its own keyboard equivalent. The collection's own record says
the opposite: the keyboard half of a drag game is a **design**, arrived at by
playtest, not a derivation. Seven worked examples, each already documented:

| Game | Pointer gesture | Keyboard equivalent, as designed |
| --- | --- | --- |
| Slide | drag a block | grab / step one cell / release — and **not** slide-to-the-end, which is fewer presses but cannot stop inside a corridor, so it cannot reach every cell the drag reaches |
| Loopy | click an edge on any of eighteen tilings | walk dot to dot along the best-continuing edge, ties broken in opposite senses for opposite arrows, plus Shift-to-aim for the nine Penrose edges no walk selects. An earlier cut used a travel modifier; the owner's playtest found it confusing |
| Galaxies | drag either end of a (tile, dot) pair | a select starts a *reverse* drag, arrows pick the dot, a second select commits |
| Bridges | drag island to island | a cone search outward for the next island, plus digit-jump to the nearest island with that clue |
| Untangle | drag a vertex | nearest point in the arrow's ±45° cone, nudge by half a tile, Tab to cycle |
| Pegs | drag a peg over another | a select arms "jumping mode"; the next arrow performs the jump |
| Sixteen | drag a row | three cursor lock modes |

Not one of those is what a mechanical derivation from the pointer gesture would
produce, and `docs/games/input.md` carries two whole sections — "Giving a drag
game a keyboard" and "Giving a geometric game a keyboard" — that exist precisely
because it is not derivable.

**And the part that *is* derivable is already derived**: `moveCursor`,
`gridCursorMove` and `cursorDelta` in `engine/pointer.ts` give every game the
reveal-and-move-in-one-press cursor, and `cursor-vocabulary.test.ts` enforces it
structurally.

## Finding 2 — the headline benefit had already shipped

The proposal's central promise is that parity becomes "what you get rather than
what you verify". Checked against the live guards rather than against the
proposal's account of them:

- `input-parity.test.ts` sweeps **all 57 games through the live registry and a
  real `Midend`**, and its two exemption lists are **both empty**. Every game has
  a keyboard; every on-screen panel key reaches the game that offers it.
- `NO_KEYBOARD` is not a hand-maintained roster: the file asserts
  `Object.keys(NO_KEYBOARD)` **equals** the derived set of games with no
  keyboard, so an entry cannot be forgotten and a stale one fails the suite.
- The secondary-button relationship is a **biconditional derived from each
  game's behavior on every run** — `ignoresSecondaryButton` is declared iff the
  game consumes `RIGHT_BUTTON` nowhere on a real board.

That last one is decisive, because the same audit already ran this exact
trade and recorded the answer:

> The new guard **derives** each game's relationship with the secondary button
> from its own behaviour on every run, which is strictly stronger than eighteen
> hand-written booleans nothing checked.
> — `audit-input-mode-parity`, task 4b.1, on removing `needsRightButton`

A gesture table moves that back the other way: from a property derived from
behavior to a property declared by the author. **This project deleted eighteen
declarations one week before this change was scaffolded, for that reason.**

## Finding 3 — the four traps are already handled a layer down

Standing constraint C2 asked that the library handle the four frontend traps.
Three and a half of the four are already handled once, and none of them by a
library — each by fixing the layer below:

| Trap | Where it is handled today |
| --- | --- |
| Stylus stripping | the midend strips `MOD_STYLUS` before `interpretMove`; a game opts out with `wantsStylusModifier` |
| Hold-as-right-button | `view-interactive.ts` skips `detectSecondaryButton` for a game declaring `ignoresSecondaryButton`, biconditional-guarded |
| Focus return | the app shell, per the `app-shell` spec |
| Bare-digit / dead-key binding | `isEraseKey` / `isCancelKey` in `pointer.ts`, plus `emittable-keys.test.ts`'s per-game source scan |

Only the fourth leaves a residue, and the residue is genuinely per-game: *which*
digits a game binds and what they mean. The proposal's own strongest sentence —
that `escape-was-a-dead-key` and the held-finger defect "were both fixed a layer
down precisely because they were never per-game questions" — is an argument that
this problem is **solved**, not that a table is needed to solve it.

## Finding 4 — the table would be escaped by more games than it serves

The proposal set its own test:

> a table that expresses the easy 80% and forces the rest through an escape
> hatch is not one obvious way, it is two ways plus a seam. Measure the escapers
> before committing to the shape.

Measured, 2026-09-05, by classifying all 57 read bodies against a candidate
library drawn from the corpus itself (cell-cycle, select-then-type, paint drag,
line drag, rectangle drag, piece drag, aim drag, edge pick, gutter press,
direction-from-center, path drag):

- **Cleanly covered — 14.** abcd, flip, keen, lightup, magnets, mathrax,
  palisade, salad, seismic, separate, singles, slant, solo, unruly. Palisade and
  Separate are covered today, but by `border-grid.ts` — a shared *mechanic*
  module, not a gesture table, which is the distinction Finding 5 turns on.
- **Needs the raw hatch outright — 14.** ascent, blackbox, bridges, crossing,
  filling, group, guess, loopy, mines, sixteen, slide, sticks, subsets,
  untangle.
- **Partial — 29.** boats, bricks, clusters, cube, dominosa, fifteen, flood,
  galaxies, inertia, map, mosaic, net, netslide, pattern, pearl, pegs, range,
  rect, rome, samegame, signpost, sokoban, spokes, tents, towers, tracks,
  twiddle, undead, unequal. The table would express one or two arms and the game
  would hand-write the rest: two ways plus a seam, in over half the collection.

The three lists are named rather than counted because a bare count is a claim
that rots; they partition all 57, and the partition is the finding.

It is not the easy 80%; it is about a quarter. And the quarter it covers is
almost exactly the set that is *already* near-identical text — which is the next
finding, and the reason this exploration ends in a different change rather than
in nothing.

## Finding 5 — the repetition is real, and it is family-shaped

`jscpd` over `src/games` (284 files, ≥12 lines / ≥90 tokens) finds 64 exact
clones and 1,262 duplicated lines. Restricting to the eleven games that carry a
pencil-mode flag — abcd, crossing, group, keen, mathrax, salad, seismic, solo,
towers, undead, unequal — and measuring their `index.ts` alone (≥10 lines / ≥70
tokens): **514 duplicated lines** in 26 clones, rising to **567 in 28** once the
flag's two spellings are folded to one name (below). Summing *both* sides of
every clone in the folded run gives 1,190 line-sides, and **714 of them (60%)
fall inside `interpretMove`**, across nine of the eleven games.

For scale, `border-grid.ts`'s own doc comment records that jscpd measured **466
duplicated lines** between Palisade and Separate, "the largest cross-game
duplication in the repository". That statement is now false, and this is what
displaced it.

The clone matcher is a text instrument, so those figures are a floor twice over:

- **The flag has two spellings.** Eight games write `hpencil`, three write
  `cpencil`; the keyboard-cursor companion splits `hcursor` / `ckey` the same
  way. Folding the two camps to one name and re-measuring takes the figure from
  514 to 567 — so the naming split alone was concealing 53 lines. This is
  the shape `unify-cross-game-vocabulary` fixed for the cursor (ten spellings)
  and for the completion vocabulary (one word meaning opposite things in three
  games); it did not catch this one, because it was scoped to those two.
- **Salad and Group contribute zero clone-sides** and nonetheless implement the
  same mechanic — they restructured it enough to escape an exact-clone matcher.
  Reading says the population is eleven of eleven; the tool can only see nine.

**What the eleven actually share** is one mechanic: *a cell you highlight, type
a value into, and pencil candidate marks in* — the sticky-pencil press block,
the digit/symbol entry block with its no-op guards, and the hide-the-highlight
rule that distinguishes a mouse-driven entry from a keyboard one. **What they
legitimately differ in is two predicates** — "can this cell take a real entry?"
and "can this cell take a pencil mark?" — plus the symbol vocabulary (digits,
letters, ghosts/vampires/zombies, circles and crosses) and their own move types.

That is precisely the `border-grid.ts` split, and the RDD already prescribed it
without anyone acting on it:

> the mechanic is shared and the semantics are not, exactly as `border-grid.ts`
> did it — extract what the player operates, leave every game its own move type
> and its own answers.

So the finding is not that the collection has no shareable input. It is that
**the shareable input clusters by puzzle family, not by gesture** — which is why
a gesture-keyed abstraction cuts across the grain and a mechanic-keyed one does
not. Filed as `unify-the-note-taking-cell`.

## Finding 6 — no downstream game was pressuring it

`docs/framework-rdd/README.md` records that "the game-definition end has had
none" of the real pressure the deduction end has had, and the scene-graph
postmortem set the bar that a framework-scale pivot needs a real downstream game
pushing on it, measured. The two greenfield pilots that would have supplied it
are both deferred behind other work, and `add-path-ts-port` says of itself:
"Expect it done much later, or not at all."

A gesture library defined without a consumer would be defined from the corpus it
is meant to replace — which is how it would come to have eleven shapes, thirteen
escapers, and a hatch.

## What survives

- **The classification itself.** The gesture shapes named in Finding 4 are a
  real vocabulary for *describing* the collection's input, and they belong in
  `docs/games/input.md` § "Drag models", which already carries three of them.
  What they are not is a contract a game can be assembled from.
- **The parity bar, unchanged**, and stronger than the table would have made it:
  derived per run, both exemption lists empty and asserted empty.
- **The rule this cost a day to restate**, now in `docs/games/input.md`: *the
  keyboard equivalent of a drag is a design, not a derivation.*

## What would reopen this

A concrete downstream game whose input the current `interpretMove` shape makes
awkward, where the awkwardness is in the *gesture* rather than in the mechanic —
and where the proposed table serves more games than escape it, measured before
the design rather than after. Neither condition holds today.
