# Engine catalog

The shared-helper reference for game work: what lives in
[`src/engine/`](../../src/engine/), when to reach for each piece, and the traps
that have already cost real debugging. Organized by category; each entry is
deliberately short — **the module's own header comment is the authoritative
documentation**, and the entry's job is to make sure you know the module exists
before you re-roll it. Where a lesson below is not yet in the module's header,
this file is its home (and moving it into the header is a welcome tidy-up).

Companion docs: [`mechanics.md`](./mechanics.md) (the `Game` contract),
[`rendering.md`](./rendering.md) (cache/overlay discipline),
[`solver-and-generator.md`](./solver-and-generator.md) (deduction and
generation discipline), [`hints.md`](./hints.md) (hint authoring),
[`testing.md`](./testing.md) (the test tiers and harness).

## Reach for these, don't re-roll

**Leaf libraries are pulled in idiomatically and lazily.** When a game needs a
union-find, a sorted collection, a loop finder, a random omino partition —
check here first. Every helper below exists because at least two games needed
it; several exist because *five or more* games grew byte-identical private
copies before consolidation.

**The promotion rule: a game-local helper gains a second consumer → promote it
to `engine/`.** `Dsf` was Galaxies-local until Pegs; `shuffle` was
Galaxies-local until Mosaic; `obfuscate` was Guess-local until Black Box;
`divvy` was Solo-local until Palisade. Keep a genuinely single-consumer helper
local to its game — the rule is a trigger, not a mandate to pre-abstract.

**Before proposing an extraction, measure — and read what the measurement is
actually counting.** A duplication tool counts *text*, and three quite different
things look identical to it. Measured across `src/games` on 2026-09-05: 982
cross-game duplicated lines, of which only some are candidates at all.

- **The `Game` object literal and the import blocks.** Every game implements one
  interface and imports the same helpers, so `id`, `defaultParams`,
  `interpretMove`, `executeMove` … in the same order in two files is the
  *contract looking like itself*. It is never the finding, and it is what the
  largest "clone" between two games usually turns out to be.
- **Real duplication of a shared mechanic**, which is what
  [`border-grid.ts`](../../src/engine/border-grid.ts) and
  [`note-taking-cell.ts`](../../src/engine/note-taking-cell.ts) came from.
- **Genuinely parallel but independent logic**, which stays put.

*Measured and declined, so it is not re-proposed:* the **three-state paint
games** (Clusters, Bricks, Sticks, Unruly, plus Tents and Pattern's
modified-arrow paint) look like a family and are not one. All six together carry
92 duplicated lines at a deliberately low threshold, and the two largest blocks
are the `Game` literal. Sticks' drag machine differs materially and has been
declined twice on its own merits (its `design.md` F7). There is no note-taking
cell hiding here; that family was the outlier, not the rule.

**Byte-match sensitivity is marked per entry.** Several helpers are
RNG-faithful ports whose draw order is observable in generated game
descriptions. The frozen differentials (see
[`testing.md`](./testing.md)) hold them in place: a refactor that changes a
draw order or a comparator changes which boards exist, and the fixtures catch
it. Where an entry says *byte-match critical*, treat its observable order as
API.

**Where a promoted helper lands: flat in `src/engine/`, unless it joins one of
the two families.** The engine is deliberately a flat namespace of independent
helpers, because a grouping that has to be argued for gets re-litigated at
every addition and files then land wherever the last argument ended. Exactly
two subdirectories exist — `engine/grid/` and `engine/color/` — and both earn
it by the same property: their members have no readership apart from each
other. The test for a third: *would a reader looking for this file know to
look there without being told?* If the answer needs the rationale explained,
leave it flat. Import shared things from where they live — re-exporting a
shared vocabulary through a game's `state.ts` recreates the private-copy
problem as re-export blocks. (Extraction criterion for borderline cases:
*would a change have to happen in both games at once?* — the border-grid
test.) One lint interaction to know when a helper touches dynamic keys:
`complexity/useLiteralKeys` is deliberately off because it inverts tsconfig's
`noPropertyAccessFromIndexSignature` — bracket access truthfully marks a key
as dynamic; when adding a lint rule, check it does not invert a compiler
flag.

## Board structure and geometry

### `dsf.ts` — union-find

`Dsf` (union-by-size) plus `FlipDsf`, the parity/flip variant (upstream
`dsf_new_flip`; each class tracks a same/opposite-sense bit) that Dominosa's
forcing-chain deduction needs. Exemplar consumers:
[`galaxies/state.ts`](../../src/games/galaxies/state.ts),
[`dominosa/solver.ts`](../../src/games/dominosa/solver.ts).

Two lessons, both byte-match surface:

- **`dsf_new_min` does not change what `dsf_canonify` returns.** The C's
  min-tracking dsf allocates a *separate* `min[]` that only `dsf_minimal`
  reads; canonify is the ordinary union-by-size root either way. A game that
  needs the minimal element (per-cage clue at its minimal cell — Keen)
  precomputes a `minimal[i]` map after all merges rather than extending the
  leaf; correct because generation never reads a minimal mid-merge, and
  byte-identical regardless of root choice because minimality is
  membership-determined. Exemplar: `buildMinimal` in
  [`keen/state.ts`](../../src/games/keen/state.ts).
- **Tell: a loop bounded by `dsf_canonify(...)` used as an index *value*
  rather than an identity to compare.** Rome's `rome_naked_pairs` skips region
  members below the canonical root — a real quirk baked into which puzzles its
  solver-gated generator emits, portable only because `Dsf` mirrors `dsf.c`'s
  tie-break. Don't "fix" such a scan to iterate the whole region.

### `border-grid.ts` — the shared border-marking mechanic

The tri-state edge grid (wall / not-a-wall / undecided) Palisade and Separate
share: edge bit vocabulary, tile-size geometry, and the input mechanic. Each
game keeps its own clue semantics, solver, generator, completion test — and its
own `Move` type (the shared code reports *which edge, which cycle*, never a
move, so two save formats aren't coupled). Its header states the sharing test
worth reusing anywhere: not "are these the same text" but *"would a change here
have to happen in both games at once?"*

### `border-grid-render.ts` — that mechanic's look

The third layer: the error model over the two DSFs (a region over `k`, under
`k`, or a wall separating nothing), the half-grid cursor `border-grid.ts`
*moves*, the four edge rects, the tile skeleton (clip, body, content, edges,
unclip, update) and the board geometry. A game supplies its palette indices as
`BorderGridColors` and a `drawContent` callback for the middle of the tile, and
keeps its clue layer entirely — Palisade's digit and hint marks, Separate's
letter and region shading.

Its header records **why a decline was reopened**, which is the part worth
reading before reopening another: `border-grid.ts` declined sharing "a loop over
`w*h` that reads a flag and draws a line", which is a true statement about
*generic* resemblance and simply does not reach the rendering of the mechanic
the module already owns. The decline was made when only the input had moved.

### `note-taking-cell.ts` — the shared highlight-and-type mechanic

The pointer half of *highlight a cell, type a value into it, pencil candidate
marks in it*, shared by the eleven games that carry `ui.pencilMode` and
`ui.cursorFromKeyboard`. `pressNoteTakingCell` resolves a left or right press
against two predicates the game supplies — `canEnter` and `canMark` — and
reports `"moved"` / `"unmoved"` / `null`; `releaseHighlightAfterEntry` and
`noOpEntryResult` are what a symbol entry does to the highlight, which is where
the two pencil preferences meet the keyboard. Same test and same line as
`border-grid.ts`: the game keeps its coordinates, its symbol vocabulary and its
own `Move`. Its header records what was evaluated and declined.

**Both pencil preferences are on by default across the family, and every member
offers both**, so a player who moves between two of these games meets the same
gesture doing the same thing. That was not true until `unify-the-note-taking-cell`:
five games kept the mouse highlight through a pencil mark with no preference at
all, and six offered the preference defaulted *off*. Guarded in
`note-taking-cell.test.ts` over the derived population, both halves — the
default and the preference's existence.

### `grid/index.ts` — planar-grid geometry (upstream `grid.c`)

`Grid`/`GridFace`/`GridEdge`/`GridDot` with full reference incidence (an edge
holds its two dots + two faces; a null face is the infinite exterior; faces and
dots carry clockwise rings), all 18 tilings (14 periodic + Penrose P2/P3, hats,
spectres under `tilings/`), plus `gridComputeSize`, `gridValidateParams`,
`gridNearestEdge`, `gridFindIncenter`, `gridTrimVigorously` and the
`gridNewDesc`/`gridValidateDesc` round-trip. **Import the barrel, not the
parts.** Consumers: Loopy (all 18 tilings), Pearl.

**The contract worth knowing before using any of it: `gridNewDesc` is the only
function in the module that consumes randomness; `gridNew` is a pure
deterministic function of `(type, width, height, desc)`.** That split lets
geometry and RNG fidelity be checked independently — a red differential means
"wrong geometry" or "wrong draw order", never "somewhere in 2,400 lines".

Four rules a new tiling must respect, each already paid for in debugging:

- **Integer arithmetic only.** Dot dedup is by *exact* coordinate equality, so
  a fractional coordinate silently splits a shared corner into two dots. Use
  `Math.trunc`, never bare `/`, where the reference used integer division.
- **Watch for negative zero.** A negative scale factor times a zero index
  gives `-0`, which passes `===` and stringifies to `"0"` yet fails
  `Object.is` — a structurally perfect grid that fails a structural
  differential. It bit the floret tiling; expect it wherever basis vectors are
  signed. Normalize once at the exact-arithmetic → pixels boundary (the
  aperiodic four) rather than scattering guards.
- **Emission order is observable.** Dot indices come from first-encounter
  order, so reordering face emission within a cell is a behavior change even
  when the geometry is identical. Verify with the index-exact differentials
  (`grid-differential.test.ts`, `grid-aperiodic-differential.test.ts`), never
  by eye.
- **A random draw is an observable side effect, not a computation.** The
  aperiodic tilings call `random_upto` *unconditionally even when the
  candidate list holds exactly one entry*. Skipping the draw when `n === 1`
  desynchronizes the stream and yields a different, entirely plausible-looking
  tiling with nothing asserting. The same rule forbids "fixing" weight
  constants that look wrong (hat's `starting_hats` uses `PROB_P` for its
  `TT_T` entry): they are what the reference drew against. This generalizes to
  **any** generator that must reproduce a seed.

### `geometry.ts` — cell ↔ pixel

`coord`/`fromCoord`, the upstream `COORD`/`FROMCOORD` mapping with the
per-game border supplied by the caller. `fromCoord` floors directly (correct
for border-region pixels without the C macro's truncating-division idiom).
Most games' `interpretMove` starts here.

### `findloop.ts` — loop/bridge finding

Tarjan bridge-finding for live loop-error highlighting. Consumers: Slant,
Bridges, Dominosa, Loopy, Tracks.

### `n-times-root-k.ts` — exact `round(n · √k)`

The bridge where the aperiodic tilings' exact irrational arithmetic becomes
integer pixels. **Do not substitute `Math.round(n * Math.sqrt(k))`** — its
header explains why the triple rounding is the wrong port even when today's
magnitudes happen to agree (a one-unit disagreement doesn't degrade a
coordinate, it splits a shared corner into two dots).

## Ordered collections and small leaves

### `sorted-multiset.ts` — `tree234`, idiomatically

**A `tree234` is almost always just a sorted set.** The games overwhelmingly
use four of its operations, and `SortedMultiset` has all four under upstream's
own semantics:

| upstream | here | note |
| --- | --- | --- |
| `add234` | `add` | |
| `del234` | `delete` | no-op when absent, so `find234`-then-`del234` collapses to a bare `delete` |
| `delpos234` | `removeAt` | indexes into *sorted order* |
| `count234` | `size` | |

Consumers: Flip, Pegs, Netslide. Three rules:

- **Port the comparator exactly** — `randomUpto(set.size)` → `removeAt(i)`
  indexes the sorted order, so the comparator is byte-match surface, not a
  tidy convention.
- **A `tree234` used as a worklist is a different question.** Check whether
  drain order can affect the result before reproducing it — a flood fill's
  reachable set cannot, so that one is a plain queue.
- **Count the roles before reaching for this at all.** **Tell:**
  `newtree234(NULL)`, or a comparator whose ordering the algorithm never reads
  back — that is not a sorted collection. Slide's `solve_board` builds two
  trees and neither is one: a `memcmp` comparator used purely for
  deduplication (→ a keyed set) and a null-comparator FIFO (→ a plain array).

**Then don't take the obvious key encoding on faith — profile it.** Slide's
"board is small, a full-board string key is acceptable" design assumption
measured at **35% of total generation time** (most candidates are duplicates
whose key is built and thrown away); a 32-bit FNV-1a hash bucketed to an exact
byte comparison kept `memcmp` semantics with no per-candidate allocation and
made the generator 3.4× faster. This is the safest place to optimize: the
byte-match differential proves the substitution changed nothing. Exemplar:
`hashOf`/`sameBoard` in [`slide/solver.ts`](../../src/games/slide/solver.ts).

### `shuffle.ts` — Fisher–Yates + permutation parity

RNG-faithful `shuffle` (upstream `misc.c`), plus `permParity` for the
sliding-tile generators' reachability check (parity *correction* stays
per-game). Byte-match critical wherever the shuffled order feeds a desc.

### `combi/` — r-of-n combination iterator

Lex-order combination enumerator (upstream `combi.c`); one consumer family.
Exhaustively property-tested (`C(n, r)` count, strict lex order, distinctness).

## Generation

### `retry-limit.ts` — bounded "generate until it works"

**Every synchronous retry loop needs a bound**: an unbounded one that never
succeeds owns its thread outright (test timeouts can't fire; vitest workers
orphan and spin a core forever). `retryLimit` turns "hangs the machine" into
"throws in seconds"; exhaustion throws rather than returning a fallback, so no
seed that used to converge can quietly produce a different desc. Its header
also records when a cap is *not* the answer (a legal-but-rare seed wants a
recovery path, with the cap outside it — Net's stalled-tie reshuffle).

### `divvy.ts` — random equal-omino partition

`divvyRectangle` (upstream `divvy.c`): divide a rectangle into equally-sized
connected ominoes. RNG-faithful; byte-match critical. Consumers: Solo
(jigsaw), Palisade, Separate.

### `laydomino.ts` — random domino tiling

`dominoLayout(w, h, rs)` (upstream `laydomino.c`): a random 2×1 tiling.
RNG-faithful (candidate-list shuffle + per-BFS-node neighbor shuffle
reproduce the reference draws). Consumers: Magnets, Dominosa.

### `symmetric-blacks.ts` — symmetric black-square placement

`placeSymmetricBlacks` (upstream `set_blacks`) plus the `SYMM_*` enum and
Custom-dialog labels. Byte-match critical (region sizing, rejection-sampling
draw order, symmetry copy order, the `SYMM_ROT4` odd-center `<=`). Callback-
parameterized over the caller's board; the caller clears its board first.
Consumers: Light Up, Sticks — the extraction was proven byte-safe by Light
Up's differential staying green through it.

### `loopgen.ts` — random loop generation

`generateLoop(g, board, rng, bias?)` (upstream `loopgen.c`) over a `Grid`.
Byte-match critical; its header records the exact draw order that must be
preserved. A `bias` callback's only observable effect is its return value, so
a **full-rescan** bias (recompute fresh each call) is provably byte-identical
to porting the incremental `tdq` machinery and far simpler — Pearl does this.

### `wires.ts` — the Net/Netslide wire model

Direction algebra, hex wire desc codec with `v`/`h` barriers, the
spanning-tree grower, barrier placement, and the `computeActive` power flood.
**Wire bits `0x0F` only — each game owns the high bits** (`0x10` collides:
Netslide `FLASHING`, Net `LOCKED`; the header's "0x10 trap"). Extracted from
Netslide when Net became the second consumer.

### `obfuscate.ts` — solution masking in descs

`obfuscate_bitmap` + `bin2hex`/`hex2bin` (upstream `misc.c`): the OAEP-style
reversible masking that keeps a shareable game id from spelling out the
answer. Consumers: Guess, Black Box, Mines, Mosaic.

### `latin.ts` — Latin-square solver *and* generator

`latinSolver` (candidate cube, generic deductions, guess-and-verify
recursion), `latinGenerate`/`latinGenerateRect`, and the RNG-faithful
bipartite `matching` (Hopcroft–Karp) — which is reusable outside the family:
Tents drives it both ways (`rs` for randomized matchings in generation,
`rs`-less for a deterministic existence check). Usage discipline — the cube
index space, `usersolvers`, the `seed` hook, `cubeOut`, the family's three
generator shapes — lives in
[`solver-and-generator.md`](./solver-and-generator.md).

## Solving and deduction

### `deduction-fixpoint.ts` — the shared technique ladder

`runDeductionFixpoint({ techniques, maxTier, budget, settled })`: the
ordered-technique fixpoint loop behind "a generator and an explained hint are two
projections of one deduction engine". A technique is a **declaration** —
`{ id, tier, run }`, both `id` and `tier` required — so the grade is the highest
tier that fired and the cap excludes by tier, never by position in the array.
`settled` is the early-out, and it means "nothing left for the ladder to do", not
"solved" (most of its callers stop on a contradiction or a budget). A
conditionally-available technique guards itself in `run`; there is no `when`
predicate and there will not be one.

**Its header's list of known no-gos is as important as its call sites** — the
ladder *shape* is near-universal; the bookkeeping wrapped around it is per-game
and often decides which puzzles exist — and that list is **re-derived when the
contract changes, never copied forward.** Nine call sites and two hatch cases
(Loopy, Lightup) as of `re-derive-the-fixpoint-no-gos`, down from six no-gos:
Unruly left when tiers became declarable, and Singles, Clusters and Spokes left
when someone read their solvers instead of their recorded reasons. See
[`solver-and-generator.md`](./solver-and-generator.md) before adopting or
"fixing" a game that doesn't use it.

### `step-budget.ts` — the fixpoint non-termination guard

A cooperative budget ticked once per fixpoint iteration on the
hint/recording path only; converts a progress-without-change regression from
an in-call hang into an immediate labeled failure. Generators run unguarded
(and byte-for-byte unchanged). Ticked through `runDeductionFixpoint`, the
failure also **names the techniques by firing count**, so the message's own
question — *"a hint rule is reporting progress without changing the board?"* —
answers itself.

### `difficulty.ts` — the cross-game difficulty contract

`DifficultyContract`: what a tiered game's tiers are, `tierOf`/`withTier`
accessors (eight games don't hold a number in their params at all), and a
discriminated solve-at-cap verdict. Declaring it enrolls the game in the shared
guards (`difficulty-contract.test.ts`) — above all **cap-monotonicity**, which
Boats shipped without, silently breaking Check & Save on every Easy board.
Details: [`mechanics.md`](./mechanics.md) (declaring) and
[`solver-and-generator.md`](./solver-and-generator.md) (grading).

### `deduction-record.ts` — the recorded-firing shape

`DeductionRecord`/`DeductionRecorder`: the seam between a game's recording
deduction pass and the shared candidate-hint mechanics. `reason` is `unknown`
precisely so each game attaches its own; `group` ties every record of one
firing together so one firing becomes one grouped hint step.

## Hint machinery

The authoring discipline for all of these is
[`hints.md`](./hints.md); this section is only the inventory.

### `hint-plan.ts` — the plan-accumulation loop

`deduceHintPlan`: the "while unfinished, ask for the single next forced
firing, apply, record" loop that four games arrived at independently. Only the
loop is shared — every rung order, reason type and narration string stays in
its game. Takes both a `planCap` (UX bound) and a `StepBudget`
(non-termination bound) because they answer different questions.

### `candidate-hint.ts` — candidate-elimination plan plumbing

The shared mechanics for pencil-notes games (naked-single finder,
lazy-populate check, next-strike/next-place lookups, generic
`keepCandidateHintTrack`/`refreshCandidateHintStep`). The per-game `buildSteps`
walk is deliberately *not* shared — see
[`hints.md`](./hints.md) § "Candidate-elimination games".

### `latin-hint.ts` — truthful Latin single classification

Re-derives whether a recorded `single` is **naked**, **hidden**, or **forced**
from the working board, so no Latin game narrates "every other number has been
ruled out in this cell" at a cell visibly holding several candidates. Includes
`narrateLatinReason` for the row/column games whose generic-arm wording is
verbatim-identical (normative rule: the `ts-engine` "shared narrator"
requirement).

### `hint-vocab.ts` — sliding-tile goal vocabulary

`workingOn(tile)` + `HINT_SETTING_UP`: the shared "goal: tactic" prefix so
Fifteen's and Sixteen's hints read as one voice.

### `slide-planner.ts` — sliding-permutation search

Bucket-queue A\* + exact bidirectional BFS + the no-progress gate + partial
plans, over "the board as the player sees it" (one integer per cell — two
boards showing the same picture are the same position, which matters when
tiles are interchangeable). Consumers: Sixteen, Netslide.

### `hint-mark.ts` — the ring and the outline

The two board marks a hint draws: a **ring** around the cell the deduction acts
on, an **outline** around the region it reasons from. Both replace the cell's
*border*, never its background — a fill behind content cannot be rescued by
choosing a different color, and a joint search over both roles, every hue and
both schemes found no feasible arrangement. `MarkBand` is how a game says where
its border lives (outside the content box for the `COL_GRID`-backed games,
inside it for the ones drawing their own per-cell outline).

### `hint-ordinal.ts` — where a cell falls in a forced chain

The small corner number that turns a Tactic's shaded set back into something
walkable. **Not an arrow**: an arrow claims *this cell forces that one*, which
is false in a third of Clusters' links; an ordinal claims only the order, which
is true in every game that draws one, and it stays inside one tile so it rides
the existing `OverlaySidecar` diff.

### `hint-refusal.ts` — what a hint says when it will not give one

The approved refusal messages, so the same situation says the same thing in
every game — `help/features.md` teaches "there is a mistake on the board" and
"deduction has run out" as a pair calling for opposite responses, which only
works if the wording is shared. Three differences are real and named there
(`CONTRADICTION_UNLOCALIZED`, `NO_MOVE_WORTH_MAKING`, a game-shaped dead end);
everything else is spelling, and `hint-refusal.test.ts` holds it to the list.

## Input

### `pointer.ts` — button codes and cursor helpers

Button constants, `stripModifiers(button)` (never redeclare `MOD_MASK`),
`isEraseKey`/`isCancelKey` and the `BACKSPACE`/`DELETE`/`ESCAPE` codes.

**The keyboard cursor lives here too, and every game holds one.** `GridCursor`
(`x`, `y`, `visible`) under `ui.cursor`, built by `newCursor(x?, y?, visible?)`
and driven by `moveCursor(cursor, button, w, h, wrap?)` — reveal *and* move in
one press, returning whether anything changed — plus `showCursor`/`hideCursor`.
`isCursorMove`, `cursorDelta` and the position-only `gridCursorMove` remain for
a bespoke traversal.

**Never restate any of it locally**, including a magic number where a named
button exists: `emittable-keys.test.ts` enforces that from `pointer.ts`'s own
export list — which is how nine games' private `moveCursor` (four of them
byte-identical) were found the day the shared one landed — and
`cursor-vocabulary.test.ts` fails the build for a cursor held under any other
field, finding it structurally rather than by name. A non-trivial *traversal*
(half-grid, lock modes, corner-skipping) still keeps its own logic, and so does
whatever a game does *while* the cursor moves; only the noun is shared.
Discipline: [`input.md`](./input.md).

### `run-length.ts` — the desc grammar eight games share

`scanRunLength(desc)` yields `{ blanks }` for a letter run (`a` = 1 … `z` = 26,
longer runs as repeated `z`s) and `{ value }` for anything else — including
characters the game will reject, because *which* value characters are legal, in
what range, and with what error message are the game's rules and stay there.
`encodeRunLength(count, emit)` is the other direction.

**`keepTrailingBlanks` is not a style option.** Palisade drops the run that
reaches the last cell; Slant and Mosaic keep it, because their `validateDesc`
rejects a desc that does not fill the grid *exactly*. Encode a Slant desc
without it and the game refuses to load its own board.

**Games with a richer desc do not use this**: Towers, Keen, Solo, Undead,
Unequal, Mathrax, Salad, Boats, Tents, Tracks and Pattern parse multi-digit
numbers, `_` separators, or two comma-separated sections whose boundary the
caller controls. **Bricks and Crossing belong with them** and were misfiled as
adopters first — the test is not "does it write `charCodeAt(0) - 97`" but "is
everything that is not a blank run a single value character". Bricks' other
token is a multi-digit clue with `_` separating two adjacent ones, over a padded
grid whose `F_BOUND` cells the desc index skips; Crossing has no value character
at all, its decimals being a second kind of *run*. Map is here for **half** its
desc: the clue list is this grammar, the edge list is a different run coding in
the same string.

The decode side has one shape. The encode side has five, and every one of them
writes the same bytes: Loopy tests `> 25` before the increment, Map and Bridges
test `=== 26` after it, Pearl grows a run by *incrementing the letter it already
wrote* and starts a fresh `a` at `z`, Palisade nested two `while`s. Five
spellings of one grammar is the argument for the module.

A desc is a player promise, so the encoder is fuzzed against the code it
replaced rather than trusted — 4,000 trials biased toward long runs, with the
prior nested-`while` encoder kept in `run-length.test.ts` as the oracle. That
exists because Palisade, the first game converted, has no frozen differential;
the other seven adopters have one and all seven are byte-clean.

The adopter roster is derived from who imports the module and swept by
[`run-length-desc.test.ts`](../../src/run-length-desc.test.ts), which also
asserts the invariant the two hand-written scans existed to uphold: **a desc
`validateDesc` accepts is one `newState` can build a board from.** Read that
file's doc comment before relying on it — its two halves are worth different
amounts, and it says which.

### `params-codec.ts` — the declared params codec

`paramsCodec` derives **both** halves of `encodeParams`/`decodeParams` from one
ordered segment list, so the two cannot drift apart. A segment names a
`paramConfig` field by its `kw` and reuses that item's accessors, which makes
the Custom dialog and the codec one field list rather than two. Five grammars
genuinely escape it (a float param, a leading letter before the dimensions, a
`switch` over multi-character strings, a `while` loop over the tail, a boolean
encoded as an integer) — those are named in the `ts-engine` spec, and a game
taking one still owes the inverse property, which
`params-stability.test.ts` asserts over a registry-derived corpus.

### `params.ts` — param-string decoding + config helpers

`parseLeadingInt` (the `atoi` + pointer-advance idiom, returning value and
next index), `parseDimensions` (leading `WxH`-or-square, restoring the square
fallback that `indexOf("x")` mis-sliced on a bare `"4"`), `atof` and `formatG`
(C's `%g` — a full-precision float param reads back as a *different* number
and the game ID stops naming its board), and the declarative
`dimensionParamConfig`/`parseConfigInt` helpers behind `Game.paramConfig`.

### `key-labels.ts` — on-screen keypad builders

`digitKeys(n)` + `clearKey` for `Game.requestKeys`, resolving labels the way
the frontend expects (`"Clear"` maps to the clear icon).

## Rendering and affordance helpers

Discipline for all of these — the cache, the diff key, the doctrine — is
[`rendering.md`](./rendering.md).

### `overlay-sidecar.ts` — the overlay diff-key rule as a type

`OverlaySidecar` owns the repack/stale/commit dance for every overlay that
doesn't live in the packed tile value. **Never hand-write the two-array
dance.** Entry points by shape: `pack` (a hint step's highlights), `packCells`
(a `findMistakes` list), `clear()`+`add()` (an overlay with its own topology).

### `draw.ts` — shared drawing primitives

`drawRecessedBorder` (the two-pentagon playfield bevel), `drawRaisedBevel` + its
companion `raisedBevelWidth` (the raised *tile* — its opposite number),
`drawRectOutline` (upstream `draw_rect_outline`), `drawThickRectOutline` (the
"this is wrong" frame, four filled bands), `drawRectCorners` (the four corner
brackets marking a keyboard cursor — promoted from **seven** byte-identical
copies; if you are typing eight `drawLine` calls around a center point, it
exists).

**Three of the five were promoted from private copies at seven, eight and six
games**, which is the pattern to notice rather than the individual helpers: if
you are writing vertex arithmetic for a shape that any other game also draws,
look here first. The reverse direction is guarded —
`raised-bevel.test.ts` fails if a game re-derives the two triangles.

**Sizing belongs here too, not only shape.** `raisedBevelWidth(ts)` exists
because the six raised-tile games had four thickness formulas between them, so
the same idiom read 1px in one game and 3px in another at the same tile size.
When you extract a shape, check whether its *dimensions* were drifting as well.

Extractions of drawing code are cheap to verify: emitted op order unchanged ⇒ no
render snapshot moves. **The converse is not evidence** — an unchanged snapshot
can also mean nothing was watching, which is what
`promote-the-thick-rect-outline` found (deleting a side of the error frame
failed exactly one test across eight games). Break the helper deliberately and
see what goes red before believing a clean run.

### `flash.ts` — the win-celebration convention

`winFlash(from, to, flashTime)`: flash exactly once on a fresh, un-cheated
unsolved→solved transition. Every game's state spells the flags `completed` and
`cheated`, so this reads them as a contract. **Only a genuinely different
celebration keeps its own `flashLength`** — more than one flashing outcome, a
non-`FLASH_TIME` duration, a condition that is not "became solved", or a
`completed` that is not a flag (the four move-count games). A
*differently-named flag* is not one of those, and cannot be: `flash.ts` lists
every survivor with its reason, and `completion-vocabulary.test.ts` fails the
build for a re-spelling — in the **engine** as well as the games, because the
save envelope's flag is part of the same vocabulary.

**What is suppressed is the Solve *command*, not a cheated *board*.** A player
who uses Solve, unmakes part of it and finishes by hand has won, and gets the
celebration. Reaching that case needs `completed` recomputed each move rather
than latched; almost every game latches it, so for them this is exactly the
older, stricter behavior. Palisade and Separate recompute — the rule came from
Palisade, which had it right first.

### `pencil-indicator.ts` — the pencil-mode glyph

The shared "pencil mode is on" indicator drawn identically across the
collection; each game only picks where it sits. **Placement has three known
answers, in preference order:**

1. **A high tile-flag bit on a cache-safe cell** — one the game's own draw
   never overpaints (no piece/animation overlap) *and* that is no cell's
   neighbor in the diff cache, so the per-tile cache repaints it on toggle
   for free (Towers uses the top-right clue-ring corner — its 3D towers only
   ever protrude up-left).
2. **An explicit end-of-redraw repaint** when no cache-safe cell exists: fill
   the indicator's region and draw the glyph at the end of every `redraw`,
   tracking last-drawn on/off on the drawstate.
3. **Grow the canvas rather than overlap the board** when there is no border
   and no spare cell at all: Mathrax adds a `tilesize/2` strip *below* the
   board — keep the grid's own geometry untouched when you do, so `fromCoord`
   and the width stay exactly as before and only the height changes.

The glyph's body color is a palette index appended past the game's C-era
enum — safe only when the game has no dark-mode `paletteOverrides` touching
that index (check `augmentation.ts`).

### `pencil-prefs.ts` — shared pencil `GamePref` declarations

Sticky-pencil and keep-highlight preference factories with per-field `Ui`
constraints (a game without the field fails to compile). `auto-pencil` is
deliberately *not* unconditioned — its label names per-game regions, so the
sentence is passed in.

### `color/` — the palette

Three layers: `colors.ts` (the twelve named colors), `palette.ts` (the
meanings — your default import), `palette-games.ts` (board-relative per-game
colors), plus `color-token.ts` (declaration/combination mechanism) and
`color-mkhighlight.ts` (upstream `game_mkhighlight` bevel derivation, with
the epsilon and near-extreme fixes the per-game copies shared). The
meaning-first discipline: [`rendering.md`](./rendering.md) § "The palette: three layers, meaning first".

## RNG and persistence

### `random/` — the bit-identical RNG

Upstream `random.c`, byte-for-byte: identical seeds produce identical
streams, which is what keeps shared game IDs reproducible across builds.
Frozen replay corpus in `__fixtures__/`. **Any generator that must reproduce
a seed treats every draw as an observable side effect** (see the grid rules
above).

### `assert-never.ts` — refusing a move the dispatch has no arm for

`assertNever` is the form to reach for at the end of a discriminated
`interpretMove`/`executeMove` chain: binding the value to `never` keeps the
compile-time exhaustiveness (add a move type, forget an arm, and it stops
type-checking) *and* adds a legible runtime refusal for the untrusted case — a
save written by another build, whose moves are cast rather than parsed. A bare
`default: throw` trades the first away for the second, because any `default`
makes the function total for the type checker. `rejectMove` is for a move type
with no union to narrow.

### Engine internals a game never imports

One line each, for orientation: `game.ts` (the `Game` contract —
[`mechanics.md`](./mechanics.md)); `midend.ts` (orchestration:
undo/redo/timer/hint+mistake lifecycles — games depend on the interface, never
the midend); `registry.ts` (`puzzleId` → implementation;
`catalog-registry.test.ts` holds it and the catalog together both ways);
`save.ts` (the versioned-JSON move-log save envelope); `types.ts` (the shared
vocabulary: `Color`, `Point`, `Rect`, config descriptions, change
notifications); `index.ts` (the public barrel); `fake-game.ts` (the midend
test suite's minimal game).

## Testing harness

[`src/engine/testing/`](../../src/engine/testing/) — the in-process harness:
`recording-drawing.ts` + `render-scenario.ts` + `svg-drawing.ts` (tier 2.5),
`differential.ts` (`describeDescDifferential`, the byte-for-byte desc shape +
the one statement that fixtures are frozen and unregenerable),
`enrollment.ts` + `hint-games.ts` (**how a cross-game guard finds its
population**: both derive it — from the registry, a game's `Ui`, or its own
comment-stripped source — so a game joins a guard by *having* the capability
and never by being listed; see [`testing.md`](./testing.md) § "How a cross-game
guard finds its population"), `slow.ts` (the
once-per-refactoring-round expensive tier), and two deliberately-independent
yardsticks (`oklch.ts`, `polygon-yardstick.ts` — each exists so a test cannot
vacuously agree with the implementation it measures; never import the
implementation into them). Usage: [`testing.md`](./testing.md).
