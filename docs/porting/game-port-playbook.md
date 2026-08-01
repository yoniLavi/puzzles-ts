# Game Port Playbook

> ## ⚠️ Read this first: there is no C any more (2026-08-01)
>
> `retire-c-engine` deleted the C engine, the Emscripten build, every
> `puzzles/auxiliary/*-trace.c` harness and `scripts/build-native.sh`. **Every
> instruction in this guide that says "read `puzzles/<game>.c`", "record a
> fixture", "build the trace harness", or "regenerate against C" is history, not
> a step you can follow.** The C is in git history if you need to read it; there
> is no running build to ask new questions of.
>
> What is still live, and why this file is still the guide:
>
> - **The 48 frozen differentials keep working** — each imports a JSON fixture
>   and never shells anything. They are the regression net for refactoring. Do
>   not delete them; do not try to re-baseline one (you cannot).
> - **The idiomatic-TS rules, the render/cache patterns, the hint bar, the test
>   tiers, the two-stage parity gate and every per-game lesson below are
>   unchanged.** They were never about the C being present.
> - **A *new* game (Path, Numgame) has no oracle at all.** Its assurance is
>   behavioural: "every generated board is uniquely solvable at exactly its
>   stated difficulty" as a property test. `scripts/new-game-port.sh` scaffolds
>   that instead of a differential stub.
> - **Registration is two edits now**, not three: `src/native/games/index.ts`
>   and `src/puzzle/catalog-data.ts` (the committed catalog).
>   `catalog-registry.test.ts` holds them together. There is no
>   `ts-ported-ids.ts` and no CMake `TS_PORTED` flag.
>
> Sections written in the past tense about porting *from* C are kept because the
> lessons in them are about the games, not the toolchain.

> **v2 (2026-06-22) — restructured live wiki.** Codified from the first 19 ports
> (Flip → Towers) and re-organised around the port *lifecycle* (before → scaffold
> → write → differential → test → gate → close). **Update this file whenever you
> work on a game** — a new port, or iterating an existing one — and hit something
> it didn't tell you, got wrong, or could say better; that edit is part of "done,"
> in the same change. See `add-game-dev-guides`.
>
> **This guide is the *how*. The *what* lives in the specs — links below are
> authoritative and must not be trusted *less* than this file.** Anti-drift rule:
> state a normative rule briefly + link it; point at an exemplar file rather than
> pasting code that rots.

Authoritative specs: [`ts-migration`](../../openspec/specs/ts-migration/spec.md)
(strategy, parity gate, C deletion, test discipline) ·
[`ts-engine`](../../openspec/specs/ts-engine/spec.md) (the `Game` interface, the
`Midend`) · [`repo-layout`](../../openspec/specs/repo-layout/spec.md) (where
things live, in-process test tiers). Strategic narrative:
[`AGENTS.md`](../../AGENTS.md). **Exemplar to read end-to-end before starting:**
[`src/native/games/galaxies/`](../../src/native/games/galaxies/) (idiomatic,
six-file split, ~3000 lines vs ~4500 in C).

## Definition of done (the checklist this guide expands)

A port is done when **all** of these hold — most are detailed in a numbered
section below:

- [ ] Long-tail risks checked against the `.c` *before* starting (§1).
- [ ] Idiomatic TS, not a C transliteration (§3.1); render cache keyed on
      `Int32Array`, every overlay in the diff key (§3.2); engine paints no pixels
      of its own (§3.2).
- [ ] Config-summary header renders (no literal `{field}`) (§3.4); preferences go
      through the `prefs` hook (§3.4).
- [ ] A uniquely-solvable game ships `findMistakes` — Check & Save depends on it
      (§3.5).
- [ ] A pencil-mark game ships the full note-taking UX (§3.7).
- [ ] Input read against the four frontend traps (§3.8a–d) — and the collection-wide
      touch guard (`engine/touch-input.test.ts`) is green, which it will be unless the
      game reads a raw button.
- [ ] Differential check decided per-game and its lifecycle handled correctly
      (§4).
- [ ] Behavioural tests at the lowest fitting tier; new render code ships a
      tier-2.5 test; heavy tests are seed-deterministic and never clock-gated
      (§5).
- [ ] **Owner-accepted full behavioural parity** before `TS_PORTED` + C deletion
      (§6) — never call a shortfall "cosmetic."
- [ ] openspec change kept current and archived with the C deletion (§7).

---

## 1. Before you start: pick the game, check the long-tail risks

Order is **simplest-first, then the games we want to enhance** (migration order in
[`AGENTS.md`](../../AGENTS.md) / [`ts-migration`](../../openspec/specs/ts-migration/spec.md)).
Before committing to a game, read its `puzzles/<game>.c` enough to check it against
the **long-tail-risk checklist** — upstream mechanisms the fork has been dodging
that need an interface decision *before* you start, not mid-port (full list under
"Long-tail migration risks" in [`AGENTS.md`](../../AGENTS.md)):

| Risk | Where it bites | Stance |
| --- | --- | --- |
| **`midend_supersede_game_desc`** | Mines (the only upstream caller — first-click-not-a-mine) | **Solved**: implement `Game.supersededDesc(state)` — the engine *pulls* the desc from state after each committed move, so `executeMove` stays pure (`add-desc-supersede-hook`). See §3.10. (Untangle didn't need it — desc is edges-only and never changes.) |
| **Undo via state-string equality** | ~~Net's rotation cycles~~ — a **phantom**: no game in the C tree compares stringified state (verified for `add-net-ts-port`; Net shipped needing none) | Suppress no-op moves *locally* in `interpretMove` (return `null`), as Galaxies and Net do; never `Object.is`/deep-compare state. |
| **`#ifdef EDITOR` move letters** | editor-only input letters | Don't map them; say so in the port's `design.md`. |
| **`printing.c`** | a future "print this puzzle" feature | Deleted at fork; no TS replacement yet — don't promise it. |

If the game trips one, the port's `design.md` must decide the approach (or the game
waits for the enabling change). Open the port as **one openspec change**
(`add-<game>-ts-port`) — proposal + tasks + design + per-game spec deltas (the
[openspec proposal workflow](../../openspec/OPENSPEC_AGENTS.md)).

### 1.0 Read the game's own docs — its author has already listed its faults

**A game's author has usually written down what is wrong with it, and it is not
in the code.** Every game in `puzzles/unreleased/` shipped a `docs/<game>.md`
with a `## Status` section saying so in the player's own terms; upstream Tatham
puts the equivalent in each `unfinished/` file's header comment. Read it *before*
the C, alongside the `TODO` block at the top of the `.c`. It is not a duplicate
of that block: it is more candid, and it says which faults the author would fix
given the chance — which is exactly the input this fork's "deliberate divergence
is the point" licence needs.

**Where to find them now.** The unreleased pages were rewritten into player-facing
help (`help/games/<game>.md`) by `audit-author-known-issues`, which stripped the
`## Status` sections — a player is not the audience for a statement about an
implementation. Every one of them, with its verdict, is in that change's
[`audit.md`](../../openspec/changes/archive/) in the archive; the original text is
in git history, as are the `.c` TODO blocks for every game whose C has been
deleted (`git log --diff-filter=D -- puzzles/unreleased/<game>.c`).

**Read both sources, because they disagree in both directions.** Crossing's
Status opened "This puzzle has severe problems" and named the request that most
improved the game (cursor auto-advance) — the `.c` did not, and the port shipped
without it because only the `.c` had been read. Boats is the mirror image: its
Status states a difficulty-curve preference that was rightly declined, while its
`.c` quietly recorded the only live defect either source had ("Certain custom
fleets don't fit in the UI"), which went unfixed for the same reason in reverse.

Triage each point into: *fix in the port* (cheap and clearly right — Crossing's
missing cursor auto-advance), *ask the owner* (a taste call the author flagged —
Crossing's colour scheme), or *record and decline* (a rewrite the port does not
justify — usually "make the solver stronger", which §4 rule 3 refuses on
principle). Whichever you choose, write it in `design.md`; a documented problem
that the port silently reproduces is the one outcome to avoid. And if the port
*quantifies* the complaint, open the follow-up change there and then — the
measurement is in hand and would otherwise have to be redone
(`replace-seismic-region-generator` is the worked example).

### 1.1 Finishing an *unfinished* upstream puzzle (`puzzles/unfinished/`)

A handful of upstream puzzles ship only a solver/generator — the whole frontend
(`interpret_move`/`execute_move`/`game_redraw`/`new_ui`, even the `game_state`
fields) is `FIXME` stubs, and the game is gated behind `PUZZLES_ENABLE_UNFINISHED`
so it reaches nobody. Porting one is a **finish**, not a transliteration: the
interaction model, rendering, win condition, `findMistakes`, and presets are yours
to design. Two things make it tractable and low-risk:

- **Reuse a structurally-similar *shipped* game's frontend wholesale.** Find a
  ported game whose *task* matches and adopt its data model + input + render
  skeleton, differing only in the cell content and win rule. Separate ("partition
  a letters grid into `k`-ominoes, one of each letter per region") is Palisade
  ("partition into equal-size regions") with letters instead of wall-count clues —
  so it took Palisade's three-valued wall model, edge-nearest-click input, half-grid
  cursor, and per-tile render *verbatim*, and only rewrote the win test
  (size `k` + one-of-each-letter) and the solver/generator (ported from the C).
  The generator often already shares a leaf with that game (both Separate and
  Palisade use `divvyRectangle`), which also gives you a **byte-match differential**
  (§4.3) even though upstream never wrote the frontend — the generator *is* real C.
- **Live-error gating on a "whole grid is one region" start.** A content check
  (Separate's duplicate-letter-in-a-region red) fires on *every* cell at the
  untouched start, where the whole grid is one region holding every letter `k`
  times — pure noise. Gate it on region *completeness* (only flag a duplicate once
  the wall-bounded region has reached size `k`), mirroring the "only flag
  provably-wrong state" philosophy the wall/size errors already follow.

Making it **user-visible** is a catalog entry, not just registration (§6): add it
to [`src/puzzle/catalog-data.ts`](../../src/puzzle/catalog-data.ts).
*(Historical: this used to mean moving its `puzzle(<game> …)` out of
`puzzles/unfinished/CMakeLists.txt` into the main `puzzles/CMakeLists.txt` with
`TS_PORTED` — and the gotcha that cost a rebuild was needing `rm -rf build/wasm/`
first, because CMake's cached config still listed the game under `unfinished` and
re-emitted its `<game>.wasm` until the cache was cleared. Both the CMake tree and
that footgun are gone.)*

**The two-stage gate (§6) partly collapses for an unfinished game — there is no
in-app C fallback.** A shipped game runs on C/WASM until its TS port is registered,
so stage 1 ("register for smoke-testing") leaves a working fallback if the port has a
bug. An **unfinished** game has none: it is gated behind `PUZZLES_ENABLE_UNFINISHED`
and is **absent from the catalog**, so registering it in `games/index.ts` alone
makes `catalog-registry.test.ts` fail (its id isn't catalogued) and the game still
doesn't appear. So to smoke-test it *at all* you must add its catalog entry
(`src/puzzle/catalog-data.ts`; historically: the main `CMakeLists.txt` +
`TS_PORTED`, rebuild) as part of stage 1 — the TS impl is the only implementation from the first moment it is visible.
What stays gated on owner acceptance is the **C deletion** (stage 2): keep
`puzzles/unfinished/<game>.c` on disk as the reference (and to back `<game>-trace`)
until acceptance, then delete it + the trace harness + archive together. Sokoban
followed exactly this: catalog move + register + rebuild in one step, C retained.
(Separate and Group are the prior instances; Slide is the fourth.) The trace harness
`#include`s the C at its unfinished path — `#include "../unfinished/<game>.c"`, not
`../<game>.c`.

**Expect an unfinished game to `abort()` somewhere its own `validate_params`
allows — and find out where before writing the trace-harness fixture list.** These
files were never played at their edges, so their asserts are load-bearing in a way a
shipped game's are not. Slide's `generate_board` tests solubility *before* each
singleton removal and never after the last one, so a board that becomes soluble only
when its final singleton goes falls out of the loop into
`assert(!"We shouldn't get here")` — which is **every board at 5×4 and 6×4**, and
5×4 is the smallest size its `validate_params` admits. That is §4 rule 1 territory
(the C has no defined behaviour there, so diverging is free): run the missing check,
confirm it draws no randomness and is unreachable on anything the C generates
successfully, and the byte-match survives untouched. Two practical consequences —
**exclude the aborting sizes from the fixture matrix** (there is no C answer to
match), and cover them with a behavioural test instead.

---

## 2. Scaffold and file layout

**Start with the scaffolder:** `scripts/new-game-port.sh <puzzleId>` stamps out
`src/native/games/<puzzleId>/` with compiling typed `Game<…>` stubs in the file
shape below (throwing where logic goes) and an empty `__fixtures__/`, then prints
the manual-edit checklist it deliberately won't do for you (the C trace harness,
the two registration edits, the icon PNGs). Fill the stubs against the C reference;
read [`galaxies/`](../../src/native/games/galaxies/) end-to-end as the exemplar.

The file shape that has held across ports (Galaxies is the reference; small games
may collapse files):

| File | Holds |
| --- | --- |
| `index.ts` | The `Game<…>` object + glue: move logic, `interpretMove`/`executeMove`, presets, `colours()`, `setTileSize`, optional `hint`/`findMistakes`, `registerGame(...)`. |
| `state.ts` | Immutable state type + params, encode/decode/validate desc + params, `newState`, `cloneState`, the move/UI types. |
| `solver.ts` | The deductive solver (used by the generator for uniqueness, by `solve`, and — if added — by `hint`/`findMistakes`). |
| `generator.ts` | `newDesc`: board generation + retry-to-target-difficulty. |
| `render.ts` | `redraw`, the palette, `computeSize`, the per-tile cache. |

### 2.1 Shared engine helpers — reach for these, don't re-roll

Leaf libs (dsf, sorted structures) are pulled in **idiomatically and lazily**: use
the shared [`src/native/engine/`](../../src/native/engine/) helpers
([`dsf.ts`](../../src/native/engine/dsf.ts) — `Dsf` (union-by-size) plus
`FlipDsf`, the **parity/flip** union-find (`dsf_new_flip`; each class tracks a
same/opposite-sense bit) that Dominosa's forcing-chain deduction needs,
[`findloop.ts`](../../src/native/engine/findloop.ts) — Tarjan loop/bridge
finding for live loop-error highlighting (Slant; Bridges/Dominosa/Loopy/Tracks
when ported),
[`laydomino.ts`](../../src/native/engine/laydomino.ts) — `dominoLayout(w, h, rs)`,
a random 2×1 domino tiling of a grid (RNG-faithful: the candidate-list shuffle +
per-BFS-node neighbour shuffle reproduce C's draws, so a generator built on it is
byte-match portable). Ported for Magnets; Dominosa reuses it when ported (so
`puzzles/laydomino.c` stays until then, like `random.c`),
[`sorted-multiset.ts`](../../src/native/engine/sorted-multiset.ts),
[`colour-mkhighlight.ts`](../../src/native/engine/colour-mkhighlight.ts),
[`pointer.ts`](../../src/native/engine/pointer.ts),
[`params.ts`](../../src/native/engine/params.ts),
[`wires.ts`](../../src/native/engine/wires.ts) — the shared **Net/Netslide
model** (direction algebra `R/U/L/D`/`A`/`C`/`F`/`ROT`, the hex wire desc codec
with `v`/`h` barriers, the spanning-tree grower over `sorted-multiset`, barrier
placement, and the `computeActive` power flood). Wire bits `0x0F` only — each
game owns the high bits (`0x10` collides: Netslide `FLASHING`, Net `LOCKED`).
Extracted from Netslide when Net became the second consumer),
[`grid.ts`](../../src/native/engine/grid.ts) — the shared **planar-grid geometry**
leaf (upstream `grid.c`): `Grid`/`GridFace`/`GridEdge`/`GridDot` with reference
incidence (an edge holds its two dots + two faces, a null face = the infinite
exterior; faces/dots carry clockwise edge/face rings) and the shared
`makeConsistent` incidence builder. Split into `grid-core.ts` (structures +
`makeConsistent`), `grid-tilings*.ts` (generators) and `grid-geometry.ts` (the
float helpers) — **import the `grid.ts` barrel, not the parts**. Landed
square-only with Pearl; `extend-grid-tilings` added **all 14 periodic tilings**
plus `gridComputeSize`, `gridValidateParams`, `gridNearestEdge` and
`gridFindIncentre` for Loopy; `add-aperiodic-tilings` completed the set at
**18** with the **four aperiodic tilings** (Penrose P2/P3, hats, spectres) under
`tilings/`, plus the `gridNewDesc`/`gridValidateDesc` round-trip,
`gridTrimVigorously` and `nTimesRootK`. **The contract worth knowing before
using any of it: `gridNewDesc` is the only function in the module that consumes
randomness, and `gridNew` is a pure deterministic function of
`(type, width, height, desc)`.** That split is what lets a tiling's geometry and
its RNG fidelity be differential-checked independently — a red test then means
either "wrong geometry" or "wrong draw order", never "somewhere in 2,400 lines".
Three rules a new tiling must respect, each of which has already cost real
debugging:
(a) **integer arithmetic only** — `grid.c:1404` says so, because dot dedup is by
*exact* coordinate equality, so a fractional coordinate silently splits a shared
corner into two dots instead of raising; use `Math.trunc`, never bare `/`, where
C does integer division;
(b) **watch for negative zero** — a negative scale factor times a zero index
gives `-0`, which passes `===`, stringifies to `"0"` and yields a structurally
perfect grid, yet fails `Object.is` and so fails a structural differential. It
bit floret; expect it wherever basis vectors are signed. Fix with `|| 0` — or,
where a tiling computes in exact irrational arithmetic and converts to pixels at
one boundary (the aperiodic four), normalise once **at that boundary** rather
than scattering guards through the arithmetic, so there is a single reviewable
choke point;
(c) **emission order is observable** — dot indices come from first-encounter
order, so reordering face emission within a cell is a behaviour change even when
the geometry is identical. Verify with the index-exact differential
(`grid-differential.test.ts` against `grid-trace.c --all`,
`grid-aperiodic-differential.test.ts` against `--aperiodic`), never by eye;
(d) **a random draw is an observable side effect, not a computation** — all
three aperiodic tilings pick weighted candidates by linear scan, and all three
call `random_upto` *unconditionally even when the candidate list holds exactly
one entry* (hat's `parents_T`, spectre's `poss_J`/`poss_L`). Skipping the draw
when `n === 1` is the obvious optimisation and it desynchronises the stream,
yielding a different — entirely valid, entirely plausible-looking — tiling with
nothing asserting. The same rule forbids "fixing" weight constants that look
wrong (hat's `starting_hats` uses `PROB_P` for its `TT_T` entry): they are what
the C draws against. This generalises past `grid.ts` to **any** port whose
generator must match a seed,
Landed with Pearl,
[`loopgen.ts`](../../src/native/engine/loopgen.ts) — `generateLoop(g, board, rng, bias?)`,
the RNG-faithful random-loop generator over a `Grid` (upstream `loopgen.c`). It is
**byte-match critical** (drives Pearl's desc): reproduce the exact draw order —
per-face `randomBits(31)`, the seed-face `randomUpto`, per-iteration `randomUpto(2)`
colour, one `shuffle(faceList)`, and a `randomUpto(10)` flip pass — with the sorted
candidate sets ordered (score desc, random, **face index**) and the delete-before-rescore
discipline mirroring `del234`/`add234`. A `bias` callback's only observable effect is
its return value, so a **full-rescan** bias (recompute the score fresh each call
instead of porting the incremental `tdq` machinery) is provably byte-identical and far
simpler — Pearl does this. Landed with Pearl). **If a second
consumer of a game-local helper appears, promote it to `engine/`.**

**A `tree234` is almost always just a sorted set — reach for `SortedMultiset`.**
Upstream uses `tree234` wherever it wants an ordered collection, but the games
overwhelmingly use only four of its operations, and
[`sorted-multiset.ts`](../../src/native/engine/sorted-multiset.ts) already has
all four under upstream's own semantics: `add234` → `add`, `del234` → `delete`
(a no-op when absent, so C's `find234`-then-`del234` collapses to a bare
`delete`), `delpos234` → `removeAt`, `count234` → `size`. Netslide's generator
(the third consumer, after Flip and Pegs) needed no new leaf at all. **Port the
comparator exactly**: `randomUpto(set.size)` → `removeAt(i)` indexes into the
*sorted order*, so the comparator is byte-match surface (§4.3), not a tidy
convention. A `tree234` used as a **worklist** (netslide's `compute_active`
drains one with `delpos234(todo, 0)`, i.e. in sorted order) is a different
matter: check whether the order can affect the result before reproducing it — a
flood fill's reachable set cannot, so that one is a plain queue.

**Read *how many* roles the `tree234`s in one function are playing before reaching
for the shared leaf at all.** `slide.c`'s `solve_board` builds two, and neither is
an ordered multiset: `sorted` exists purely to **deduplicate by exact bytes**
(comparator `memcmp`, ordering never read out), and `queue` is created with a
**`NULL` comparator** and driven by `addpos234`/`delpos234(queue, 0)` — a null
comparator means it isn't a sorted collection at all, just an index-addressed
**FIFO**. So the idiomatic replacement is a keyed set plus a plain array, and
`SortedMultiset` would be the wrong answer twice over. **Tell:** `newtree234(NULL)`,
or a comparator whose result the algorithm never reads back in order.

**Then don't take the obvious key encoding on faith — profile it.** That port's
design said "the board is small, so a per-node full-board key is acceptable; do not
prematurely hash." Measurement said the opposite: a
`String.fromCharCode(...board)` key per candidate move was **35% of total generation
time**, because most candidates turn out to be duplicates whose key is built and
thrown away. A 32-bit FNV-1a hash bucketed to an exact byte comparison keeps
`memcmp` semantics with no per-candidate allocation and made the whole generator
**3.4× faster** — from ~2.4× the C's wall clock to ~0.7× it. This is the safest
possible place to optimise, and the reason is §4.3: a byte-match differential proves
the substitution changed no behaviour, so the only question left is speed. Exemplar:
[`slide/solver.ts`](../../src/native/games/slide/solver.ts) (`hashOf`/`sameBoard`).

**Shared `GameDrawing` primitives live in
[`draw.ts`](../../src/native/engine/draw.ts)** — `drawRecessedBorder` (the
two-pentagon playfield bevel), `drawRectOutline` (upstream `draw_rect_outline`),
and `drawRectCorners` (upstream `misc.c draw_rect_corners`, the four corner
brackets that mark a keyboard cursor). The last was promoted from **seven**
byte-identical private copies when Crossing would have been the eighth; if you
find yourself typing eight `drawLine` calls around a centre point, it already
exists. Extractions like this are cheap to *verify*, not just to make: the
emitted op order was unchanged, so no render snapshot moved and the seven games'
tests stayed green through the refactor — which is the check that an extraction
of drawing code needs.

**Symmetric black-square placement is shared:**
[`symmetric-blacks.ts`](../../src/native/engine/symmetric-blacks.ts) —
`placeSymmetricBlacks` (upstream `set_blacks`, which `sticks.c` copied
verbatim from `lightup.c`), plus the `SYMM_*` enum and the Custom-dialog
`SYMMETRY_CHOICES` labels. It is byte-match critical (region sizing,
rejection-sampling draw order, symmetry copy order, the `SYMM_ROT4`
odd-centre draw with its `<=` comparison) and callback-parameterised over the
caller's board (`isBlack`/`setBlack`); the caller clears its board first.
Light Up and Sticks are the consumers — the extraction was proven byte-safe
by Light Up's differential staying green through the refactor.

The bipartite **`matching`** (Hopcroft–Karp, RNG-faithful) lives in
[`latin.ts`](../../src/native/engine/latin.ts) alongside `latinGenerate`, and
is reusable outside the Latin family: Tents drives it both ways. Its `rs` is
**optional** — pass it to randomise among matchings (generation, byte-match
sensitive) or omit it to run deterministically (an existence/cardinality check,
upstream's `rs = NULL`). It returns only the left→right assignment (`LtoR`); a
game that needs upstream's `outr` (right→left) derives it by inverting —
`outr[LtoR[L]] = L` for each matched `L` — which is byte-identical to reading
C's `outr`, and the edge count is just the number of matched `L`. Tents uses
the RNG form to place trees against tents in generation and the `rs`-less form
in its completion check (does a perfect tree↔tent matching exist?).

In `interpretMove`/`decodeParams`, reach for these instead of re-rolling the idiom
(every game grew its own copy until they were consolidated):

- [`stripModifiers(button)`](../../src/native/engine/pointer.ts) for
  `button & ~MOD_MASK` (and `MOD_CTRL`/`MOD_SHFT`/`MOD_NUM_KEYPAD` for the bits
  themselves) — don't redeclare `const MOD_MASK = 0x7800`.
- [`gridCursorMove(button, x, y, w, h, wrap?)`](../../src/native/engine/pointer.ts)
  for the bounded (or toroidal) cursor clamp. It returns `null` on a non-cursor
  button **and** on a clamped-edge no-op, so `?? { x, y }` reproduces the "always
  returns a position" shape while per-game policy (which field holds the cursor,
  "first arrow reveals it", `UI_UPDATE` vs `null`) stays local. Pair with
  [`isCursorMove(button)`](../../src/native/engine/pointer.ts) for the
  `CURSOR_UP..CURSOR_RIGHT` range check. A non-trivial traversal (half-grid cursor,
  corner-skipping, lock modes) keeps its own logic.
- [`parseDimensions(s, start?)`](../../src/native/engine/params.ts) for a leading
  `WxH`-or-square dimension prefix (`next` continues a trailing suffix). It restores
  the square fallback that `s.indexOf("x")` silently mis-sliced on a bare `"4"`. Not
  for non-`WxH` formats (e.g. Blackbox's `w<W>h<H>m…M…`).
- [`runDeductionFixpoint({ rungs, maxRung, budget })`](../../src/native/engine/deduction-fixpoint.ts)
  for a logic game's solver/hint loop. A game's generator and explained hint are two
  projections of **one deduction engine** — the same ordered technique rungs run to a
  fixpoint (restart-on-first-firing), recorder off to generate/grade, recorder on to
  narrate. This runner owns the loop, the `maxRung` grading cap, and the recording-path
  step budget (pass a `stepBudget` on the hint call, omit it on the generator call); the
  *techniques* stay per-game. Standing bar: **no generic "just because" hint fallback** —
  narrate every accepted deduction, or reject at generation the boards you can't narrate
  (choose by measured rejection cost). See hint-authoring [§1A](./hint-authoring.md) and
  the `ts-migration` narratable-deduction generation policy.

### 2.2 Latin-square games share `engine/latin.ts`

The generic `latin_solver` framework (the candidate cube, positional/numeric + set
elimination, forcing chains, guess-and-verify recursion) and the RNG-faithful
generator (`matching`/`latinGenerate`/`latinGenerateRect`) are ported there once:
`latinSolver(grid, o, cfg)` with per-game `usersolvers` + a `valid` callback, the
numeric `DIFF_IMPOSSIBLE/AMBIGUOUS/UNFINISHED = 10/11/12` sentinels. **Towers is the
first consumer; Unequal/Keen/Solo/Group reuse it.** A Latin game's `solver.ts`
is then just its own clue deductions (`usersolvers`) + validator + a thin driver
mapping its difficulty levels onto the `cfg` fields. The cube is indexed
`(x·o + y)·o + (n−1)`; deductions that read a cube slice are usually cleanest
expressed as a line's cell list + `solver.cubeGet(x,y,n)` /
`solver.cube[solver.cubepos(x,y,n)] = 0` rather than re-deriving C's start/step
arithmetic — *but* when the C solver works in a **transposed** index space with dense
flat reads (Keen's `boxlist`/`whichbox`/`sq` all hold `s = x·w + y`, read as
`cube[s·w + n−1]` which equals `cubeGet(x,y,n)`), porting the flat reads *verbatim*
with a clear comment is the lower-risk faithful choice — re-deriving them into
`cubeGet` is error-prone and would diverge a byte-match differential (same lesson as
the `gg_best_clue` transposition below). Exemplars:
[`towers/solver.ts`](../../src/native/games/towers/solver.ts) (clue heuristics),
[`unequal/solver.ts`](../../src/native/games/unequal/solver.ts) (two modes — link
elimination vs adjacency elimination — dispatched off `ctx.mode`; the optional
per-recursion `ctxNew` is omitted because the ctx is immutable, exactly as
upstream's structurally-identical `clone_ctx`),
[`keen/solver.ts`](../../src/native/games/keen/solver.ts) (per-cage arithmetic
deductions; the EASY/NORMAL/HARD `iscratch` accumulation variants + the "revert to
easier after one cross-box hard hit" early return, all in the transposed cube space),
[`group/solver.ts`](../../src/native/games/group/solver.ts) (associativity
forward-deduction + identity-hidden elimination; the 5th consumer, reusing latin.ts
with **zero** changes — Group is "two `usersolvers` + a `valid`" and nothing else).
**A clue that constrains a cell without placing a digit needs the `seed` hook.**
`latinSolver` seeds its cube from the working grid, which covers every given
*digit* — but Salad's Number Ball clues are a ball ("a symbol lives here") and a
cross ("none does"), which rule candidates out of a cell while placing nothing.
Upstream applies exactly that class of constraint in the gap between
`latin_solver_alloc` and `latin_solver_main`, and `LatinSolverConfig.seed` is
that gap. It is **not** re-applied inside `latinSolverRecurse`, faithfully to the
C (whose recursion re-allocs a bare sub-solver) — sound only for a game that
never recurses, so check your `diffRecursive` before relying on it.

**A pseudo-Latin game's solved grid is not a full square, and that is correct.**
Salad fakes "some squares stay empty" by treating the order-`o` square's symbols
above `nums` as holes — and *which* of those interchangeable hole symbols lands
where is genuinely undetermined, so the cube never collapses on those cells and
the solver leaves them at 0. The acceptance test is therefore upstream's
`latinholes_check` (which counts a 0 **or** an above-`nums` symbol as a hole),
never "the grid is full" or the difficulty `latinSolver` reports. Read a cell's
solution as `grid[i] <= nums ? grid[i] : 0`, and expect a test that asserts a
complete square to fail for a reason that has nothing wrong with it. Exemplar:
[`salad/solver.ts`](../../src/native/games/salad/solver.ts).

Group's port surfaced one reusable byte-parity trap: **a `usersolver`'s
contradiction `return -1` may sit inside `#ifdef STANDALONE_SOLVER`, so the
*shipped game build* has an empty `else` and silently skips the impossible
placement.** The trace harness is a game build, not the standalone solver, so
port the shipped behaviour (no `-1` there) — writing the "obvious" `-1` would
diverge a byte-match desc. Read each `#ifdef STANDALONE_SOLVER` block to see
whether the `return`/mutation is inside it (skip) or only the debug `printf` is
(keep the logic) — `group_normal` has both kinds a few lines apart.

**Three generator shapes in the family.** (1) Towers *derives* every clue from the
full square then removes. (2) **Unequal (and Solo) greedily *assemble* clues** onto a
blank board (`gg_best_clue` picks the clue whose cell has the most remaining
candidate possibilities, then `game_strip` removes redundant ones); that generator
reads the solver's *remaining-possibility* counts, so `latinSolver` takes an optional
`cubeOut?: Uint8Array` that receives the final candidate cube (upstream
`memcpy(state->hints, solver.cube, …)`); omit it on the solve/hint path. Two
byte-match traps it surfaced, both §4.4-style "reproduce the quirk verbatim":
(a) `gg_best_clue` reads `hints[loc*o + j]` with `loc = y*o+x`, a **transposition**
against the cube's `(x*o+y)*o+n` layout — keep the raw flat read, don't "fix" it to
`cubeGet`, or the greedy choice (and the desc) diverges; (b) the numeric vs
inequality clue codes are shuffled in **two separate** `shuffle` calls, in that
order — reproduce both. Exemplar:
[`unequal/generator.ts`](../../src/native/games/unequal/generator.ts). (3) **Keen
*partitions* structurally**, no `cubeOut` needed: `latinGenerate` the solution, place
dominoes at prob 3/4 then fold remaining singletons into a neighbour under `MAXBLK`,
choose a balanced mix of cage ops (good vs `<<BAD_SHIFT` candidate buckets), then
solver-gate on *exactly* the target difficulty (§4.4 — the published cage clues
depend on the TS solver's verdict matching C). Exemplar:
[`keen/generator.ts`](../../src/native/games/keen/generator.ts).

**`dsf_new_min` does NOT change what `dsf_canonify` returns — check before you
design around it.** It allocates a *separate* `min[]` array that only
`dsf_minimal` reads; `dsf_canonify` on a min-dsf is the ordinary union-by-size
root, exactly like the shared `Dsf`'s. Rome's `design.md` assumed the opposite
and planned to extend `engine/dsf.ts`; the correction cut both ways and is worth
carrying because both halves recur. (a) **Nothing needed extending**: Rome's one
`dsf_minimal` call marks every square in a goal's component, which is *exactly* a
same-class test (`dsf.equivalent`) — the C's scan from the class minimum is an
optimisation, not a semantic. (b) **But the root's identity became byte-match
surface**: precisely *because* the root isn't the minimum, `rome_naked_pairs`'
`for (k = c; k < s; k++)` genuinely skips region members below it, weakening the
deduction on those regions — a real quirk baked into which puzzles the
solver-gated generator emits, and portable only because `engine/dsf.ts` already
mirrors `dsf.c`'s tie-break. Implementing the design's premise would have changed
every board. **Tell:** a loop bounded by `dsf_canonify(...)` used as an *index
value* rather than as an identity to compare.

**A cage/region game over the shared `Dsf` needs a precomputed minimal-element
map.** Games that store a per-cage clue at its minimal cell (Keen) or list cages in
minimal-cell order rely on `dsf_minimal`'s identity, not just connectivity. The shared
[`engine/dsf.ts`](../../src/native/engine/dsf.ts) `Dsf` uses union-by-size and does
**not** track a minimal element. Don't add a min-dsf variant to the leaf: precompute
`minimal[i] = smallest j with canonify(j) === canonify(i)` once after all merges (a
single ascending pass — `buildMinimal` in
[`keen/state.ts`](../../src/native/games/keen/state.ts)). Correct because generation
and `parse_block_structure` never read a minimal mid-merge. The minimal element is
membership-determined, so it is byte-identical regardless of which root union-by-size
picks — a generator that only uses the dsf for membership + minimal + size is
byte-match portable on the shared `Dsf` without matching `dsf.c`'s root choice (unlike
the Filling §4.4 case, which reads `canonify(i)` as an element).

### 2.3 Pointer coordinates can be fractional

Most ports convert a pixel to a cell index via
[`fromCoord`](../../src/native/engine/geometry.ts) (a `Math.floor`), so this never
bites. But a game that stores *pixel-space* coordinates in its state — Untangle
keeps rational vertex positions — must **round pointer input to integers at the
boundary** (`devicePixelRatio` scaling delivers sub-pixel coords where upstream's
GUI frontend hands `interpret_move` integers). Untangle's exact-integer crossing
test threw a `BigInt` `RangeError` on the first in-window fractional drop; the fix
rounds in `placeDraggedPoint` and re-checks the integer invariant in `executeMove`
(the single drag/solve/replay/load chokepoint) so a bypass fails loudly. Exemplar:
[`untangle/index.ts`](../../src/native/games/untangle/index.ts).

---

## 3. Writing the port — idiomatic TS

### 3.1 Idiomatic, not a C transliteration

Use the C as a **reference for the logic** (what the solver deduces, how the
generator ensures uniqueness), not a control-flow template. The bar and rationale
are the "TS port style" section of [`AGENTS.md`](../../AGENTS.md): classes over
handle-passing, `[Symbol.iterator]()` over `while (next())`, `boolean`/discriminated
unions over `0|1` sentinels, GC over `dup`/`free`, modern data structures over
C-array mirrors. There is no corpus a refactor can break, so write it clean the
first time.

**Watch for logic that is correct only because of what `memmove` leaves behind.**
`memmove` *copies*; it does not clear the source. So after C opens a gap in an array
(`memmove(a + i + n, a + i, …)`), the vacated slots still hold their old values, and
the code that follows may quietly *read them back*. Inertia's tour-growth splice did
exactly this: when it opened the gap on top of a vertex (`n1 == n2`, the
round-trip-out-of-one-vertex case) it then re-read `circuit[n1]` and got the vertex
that had been "moved away". A JS `splice`/`concat` that fills the gap with a
placeholder destroys that value, and the shortest-path walk fails with a
"no predecessor at distance − 1" — on the *round-trip case only*, so a naive test can
miss it. The same suspicion applies to any C array shuffle (`memmove`/`memcpy` over
overlapping ranges, a `realloc`'d buffer read past its logical end): ask what the
vacated region still holds and whether anything reads it.

The narrow fix is to capture the endpoints *before* the splice. The real fix is to
stop transcribing the in-place surgery at all — build the new array out of the pieces
you mean (`[...before, ...detour, ...after]`) and the whole class of bug cannot be
written. Inertia now does the latter; see the tour in
[`inertia/solver.ts`](../../src/native/games/inertia/solver.ts) (`spliceDetour`), and
§4.3 for why the byte-match that caught this was then deliberately given up.

**The "shared frozen matrix" pattern cannot actually use `Object.freeze`.** A game
whose state has a component that never changes after `newState` (Flip's matrix,
Netslide's barrier grid) should share the one array by reference across every state,
so a move copies only the part that moves — but `Object.freeze` **throws** on a
populated typed array (`TypeError: Cannot freeze array buffer views with elements`),
so the `readonly` type is the whole guarantee. Don't reach for a runtime freeze and
don't switch to a plain `Array` to get one; just don't write to it.

### 3.2 Rendering: the cache, the diff key, the doctrine

**Cache key:** pack flags into an `Int32Array`, *not* `BigInt64Array` (`BigInt` is
hot-path-expensive and idiomatically wrong here). When the key bits run out, move the
overflow into an **`OverlaySidecar`** checked in the cache-miss branch (Galaxies'
`wrongEdges`), don't widen to `BigInt`. Exemplars:
[`galaxies/render.ts`](../../src/native/games/galaxies/render.ts),
[`range/render.ts`](../../src/native/games/range/render.ts).

**When the candidate set alone exceeds ~26 bits, don't pack the digit *and* the
pencil bitmap into one `Int32` — keep two parallel cache arrays.** Keen packs
`digit | pencil << 16` because its order `w ≤ 9` leaves room. Solo's order `cr` can
reach 31 (`validateParams` caps `c·r ≤ 31`), so a 5-bit digit + a `cr`-wide pencil
bitmask is up to 36 bits and overflows a single `Int32`. The faithful answer is a
per-cell *pair* — `tiles = digit | hl<<8` and a separate `pencil` array holding
`state.pencil[i]` verbatim (the `1<<n` mark for `n` up to 31 still fits an `Int32`,
sign bit and all, and compares fine) — plus the usual mistake `OverlaySidecar` in the
diff key. Exemplar:
[`solo/render.ts`](../../src/native/games/solo/render.ts) (`SoloDrawState.tiles` +
`.pencil` + `.wrong`).

**Every overlay that doesn't live in the tile value MUST be in the diff key — or it
silently fails to repaint.** A mistake/hint/highlight overlay is applied *on top of*
a cell, so it usually isn't part of the cell's packed tile value. If it isn't *also*
compared in the cache-miss branch, it only repaints when the cell's tile
coincidentally changed that frame — and Check-&-Save (or a hint) runs a frame
*after* the move that drew the cell, so the cell's tile is unchanged and the overlay
**never shows**. Towers shipped exactly this bug: the mistake overlay (`ds.wrong`)
was passed to `drawTile` but left out of the diff condition, so Check-&-Save
highlighted nothing. **Never hand-write the two-array dance** — for *any* overlay.
`src/native/engine/overlay-sidecar.ts` (`OverlaySidecar`) owns repack/stale/commit;
give each overlay its own instance on the draw state, then per frame: pack it once,
`ds.<overlay>.stale(i)` as a clause of the cache-miss test, `ds.<overlay>.packed[i]`
(or `.at(i)`) handed to the cell painter, `ds.<overlay>.commit(i)` after drawing.
Three pack entry points, by the shape of what you have:

| You have | Call | Exemplar |
| --- | --- | --- |
| A hint step's `highlights` (`area`/`targets`/`marks`) | `pack(step?.highlights, indexFn, markBitsFn)` | the five candidate-family renders |
| A `findMistakes` cell list | `packCells(mistakes, indexFn)` | `towers/render.ts` `ds.wrong` |
| An overlay with its own topology | `clear()` + `add(i, bits)` | `galaxies/render.ts` `ds.wrongEdges` — one wrong wall is a *shared* edge, so it lights a different bit in each of the two tiles it separates |

The **hint** overlay is guarded cross-game by
`src/native/engine/hint-overlay.test.ts` (warm the drawstate, display a hint,
assert the same drawstate emits paint ops) — every game in
`testing/hint-games.ts` is covered automatically. The **mistake** overlay still
needs a per-game paint-twice test (a mistaken board can't be built generically):
paint, then `findMistakes()`, then redraw the *same* drawstate and assert the
highlight appears on the **second** paint — and, ideally, that a third frame
*without* the overlay erases it. A cold-frame test proves nothing here: on frame 1
every cell misses the cache anyway, so a missing-from-the-diff-key overlay still
paints. Exemplars: `towers.test.ts` ("highlights a mistake even when the cell was
already drawn"), `galaxies.test.ts` ("recolours a flagged wall on a board that was
already drawn").

**A display-only counter with the wrong *type* is a bug you may just fix.** The
§4 byte-parity rules are about the generator/solver/codec; on the drawing path
"deliberate visual improvements are the point of the fork". Crossing's
`game_redraw` declares `bool flash` and assigns `(int)(flashtime/FLASH_FRAME)`
to it, so its nine-phase completion animation collapses to a single static
colour shift — while `FLASH_TIME` is literally defined as `FLASH_FRAME * 9` and
the colour index reads `(x + y + flash) % 9`. The intent is unambiguous, the fix
is one type, and nothing downstream of the renderer can see it. Take it, say so
in `design.md`, and pin it with a tier-2.5 test that two flash phases paint
differently (a snapshot alone won't tell you the animation is *moving*). The
general tell: a frame counter, phase index or animation step stored in a
`bool`/`char`, or compared for truthiness where the code then uses its value.
**Seismic is the second instance and widens the tell to plain data**: its
`game_redraw` assigns a **9-bit** pencil-candidate mask to a `char`, so a
pencilled 9 is truncated away and never drawn. So also check any bitmask/flag
word copied into a narrower local before use — not just counters. Both fixes are
one type each and invisible outside the renderer. When the exposing input is one
the *generator* never produces (only a nine-cell region can hold a 9, and no
generated Seismic board has one), hand-build the board through the game's own
codec for the regression test rather than hunting a fixture — that also proves
the input is genuinely reachable in play. Exemplar:
[`seismic/render.ts`](../../src/native/games/seismic/render.ts) +
`seismic.test.ts` ("draws every pencil mark, including a 9").

**A clue-ring tile that erases its own area can rub out a line the *cell* drew
on the shared boundary pixel.** Games with a margin of clues around the play
area (the Latin family, Salad, Rome) usually repaint one clue tile at a time:
fill it with the background, then draw the letter. But the grid's outermost
border line belongs to the neighbouring **cell**, and on one edge it lands on
the clue tile's own first pixel — so a symmetric `ts − 1` erase wipes it. Only
that one edge is affected, which is why upstream's four erases look
gratuitously inconsistent (Salad's right clue is `tx+1, ty+1, TILE_SIZE-2`
against `tx, ty, TILE_SIZE-1` for the other three). **That asymmetry is
load-bearing: do not fold the four sides into one uniform rect.** Salad shipped
exactly that tidy-up and lost the right-hand border of every row that *had* a
right clue — visible only on the edge, and only for clued rows, so it reads as
a font/anti-aliasing artefact rather than a bug. Pin it with a tier-2.5
assertion on the *invariant* ("no clue-tile erase overlaps the grid's outline
box"), not on the pixel offset, so a different fix still passes; exemplar
`salad-render.test.ts` ("does not let a border clue's erase wipe the grid's
outline"). Cheapest way to see it at all: `toSvg` the frame and rasterise it
(§3.13) — at 1× the missing hairline is easy to miss.

**Some games draw their grid lines as *negative space* — don't "add" the lines
you can't find.** Rome's `game_redraw` contains no line-drawing at all: the
first frame floods the whole canvas with `COL_BORDER`, and every square then
paints its own background rect *inset* by one pixel everywhere and by a further
`GRIDEXTRA` on each side that meets a **different outlined region**. What
survives the fills is the grid — a hairline between squares of one region, a
double-width line along a region boundary — so the region outlines cost zero
drawing code and fall out of four `dsf` comparisons. Two things follow: a port
that "helpfully" strokes the boundaries will double-draw, and the *inset* is the
thing to assert in a tier-2.5 test (compare a square whose neighbour shares its
region against one whose doesn't, and expect a wider rect), not a line op that
does not exist. Exemplar:
[`rome/render.ts`](../../src/native/games/rome/render.ts) + `rome-render.test.ts`
("insets a square's fill on each side that meets a different region").

**Rendering doctrine (hard-won — see the Flip three-iteration story in
[`AGENTS.md`](../../AGENTS.md)):** the engine paints **no pixels of its own**; each
game fills its own background in the `!ds.started` branch. `Midend.size` is
side-effect-free; `canvasCleared()` is the *only* cache-stale signal.

**Check the web build's compile defines before porting `#ifdef`-gated geometry.**
`cmake/platforms/webapp.cmake` defines **`NARROW_BORDERS`**, so a game whose C
carries an `#ifdef NARROW_BORDERS` variant (Slant: `BORDER = CLUE_RADIUS + 1`
instead of a full tile) must port the *narrow* variant — parity is with what the
browser actually showed, not the desktop default. Grep the game's `.c` for
`#ifdef` before writing `computeSize`. Exemplar:
[`slant/render.ts`](../../src/native/games/slant/render.ts).

**Drag-preview games: put move application in a separate module, not `index.ts`.**
Upstream `game_redraw` for a drag game (Signpost, and Untangle earlier) reflects
the *in-progress* drag by simulating the release move and drawing the resulting
state — so `render.ts` needs to call `executeMove` + the release-move helper. If
those live in `index.ts`, `render` ↔ `index` is a cycle. Split them into a small
`moves.ts` (`executeMove` + `dragReleaseMove`) that both import. Blitter drag
sprite (save the background under the moving arrow, restore next frame) — a second
exemplar after Pegs — lives in `render.ts`. Exemplar:
[`signpost/moves.ts`](../../src/native/games/signpost/moves.ts).

**And such a game needs `changedState` to cancel a dangling drag — upstream
asserts here.** A drag preview names a *piece* on the board (Slide's
`ui.dragAnchor`), and the board can change while the pointer is still down: an undo
from the toolbar or keyboard mid-drag. Upstream's `game_changed_state` is empty and
its `game_redraw` `assert`s that the simulated move succeeds, so that sequence is
an assertion failure in the C and a thrown error in a naive port. Cancel the drag in
`changedState` — a bare `UI_UPDATE` (which is all a grab or a drag-follow is) never
reaches that hook, so the gesture is unharmed — and make the preview fall back to
the plain board rather than throwing, so a future path here degrades instead of
crashing. **Tell:** a `redraw` that calls the game's own move helper on `ui` state
and can't handle "no". Exemplar:
[`slide/index.ts`](../../src/native/games/slide/index.ts) (`changedState`).

**A C *cursor* blitter usually shouldn't become a TS blitter.** Upstream often
saves/restores the pixels under the keyboard cursor with a blitter so it can draw
the cursor anywhere without dirtying the cell cache. In a TS port whose cursor sits
*inside* a cell (or a sub-cell slot), the simpler faithful translation is to fold
the cursor position into that cell's packed cache key and draw the cursor marks in
the cell repaint — the old cell repaints when the cursor leaves (its key changed),
so no save/restore is needed and the recording double sees real ops instead of
blitter no-ops. Reserve actual blitters for sprites that cross cell boundaries
mid-drag (the Pegs/Signpost case above). Exemplar:
[`subsets/render.ts`](../../src/native/games/subsets/render.ts) (upstream's
`draw_rect_corners` blitter cursor as a `cursor-slot` field of the cell key).

**The exception: a game whose cell repaint deliberately doesn't clear the whole
cell.** Folding the cursor into the key only erases it because the cell repaint
paints over where it was. Spokes' repaint clears a *plus-shape*, leaving its
four corner squares alone so a second pass can own the diagonal line running
through the point where four cells meet — and the cursor's diagonal offsets put
it inside exactly those corners. There the blitter is right, and it costs
nothing testable: the recording `GameDrawing` no-ops only `blitterSave`/`Load`,
so the cursor's own `drawLine` ops are still asserted. Check what your cell
repaint actually clears before applying the default. Exemplar:
[`spokes/render.ts`](../../src/native/games/spokes/render.ts) (the corner
protocol is spelled out in its module header).

### 3.3 Palette

**A game contains no colour value. Not one.** Every colour your game shows is a
reference into the collection's colour table, or a call to a shared function from
it. Three layers, three import paths, and which one you reach for is the decision:

- [`engine/palette.ts`](../../src/native/engine/palette.ts) — **the meanings**,
  and your default. `ERROR`, `HINT_ACTION`, `HINT_FILL`, `HINT_EVIDENCE`,
  `CURSOR`, `HELD`, `DRAG_ADD`/`DRAG_REMOVE`, `UNDECIDED`, `GRID_MID`,
  `GRID_DARK`, `PENCIL_BODY`, `INK`, `PAPER`, plus the background-derived
  `pencilColour`, `playerEntryColour`, `highlightWash`, `lineMaybeColour`,
  `lineNoColour`, `clueDoneColour`, `wallColour`, `correctRegionColour`. Each is a
  **reference** to a named colour, so restyling red restyles every meaning built
  on red.
- [`engine/colours.ts`](../../src/native/engine/colours.ts) — **the palette
  itself**: twelve names (`RED` … `PINK`, `GREY`, `BROWN`, `BLACK`, `WHITE`), most
  at three intensities (`BLUE`, `BLUE_WASH`, `BLUE_BOLD`), plus the sets `TEN`,
  `TEN_NAMES`, `EIGHT_FILLS`, `FOUR_FILLS`.
- [`engine/palette-games.ts`](../../src/native/engine/palette-games.ts) — colours
  your game defines **relative to its own board**, prefixed with its id
  (`slantGrid`, `undeadGhost`). Functions, not values.

Write `out[COL_ERROR] = ERROR;`. Tokens deliberately drop the `COL_` prefix, which
in this codebase means "a palette **index**", so your game's own index constants
keep matching its C enum and the two namespaces never collide.

**Reach for a meaning first. Reach past it to a named colour only where the
*name* is load-bearing to the player** — a member of a set whose job is to be told
apart (`TEN`), or a colour your game says out loud (Flood's hint reads "Fill with
orange", and `TEN_NAMES` is re-exported alongside `TEN` so the word and the colour
cannot drift). Everything else is a meaning: if you write `out[COL_CURSOR] =
GREEN` where `CURSOR` would do, the next scheme has to rediscover that this green
was a cursor.

The escape hatch is real but narrow, and it is where the sprawl grows back. A game
whose board has *spent* the default may pick a different named colour — Spokes'
cursor is `PURPLE` because green is a held hub and blue is a ruled-out spoke,
Blackbox's is `RED` because its board is grey throughout. **Say why, at the
assignment, in one line.** Before `consolidate-colour-palette` there were 190 named
colours and seventeen cursors; the seventeen were read as seventeen decisions and
were really one decision plus a handful of collisions.

**If nothing in the palette fits, that is an exception and it gets written down**
(what it means to the player, and why no meaning and no named colour serves), in
`palette-games.ts` under your game's prefix. There is currently **one** in the
whole collection — Unruly's two tile colours, which are *bevel bases* where
near-black and near-white are headroom rather than shades. Aim to add none. The
palette is small on purpose, and "one more shade" thirty times is how the
collection got to 190.

**A colour defined *relative* to something is a named function, in
`palette-games.ts`.** `slantGrid(background)`, `undeadGhost(background)`,
`mkhighlightSpecific(UNRULY_BLACK)`. Do not open-code `bg[0] * 0.9` in your game:
it is the same colour decision written as arithmetic, and it puts the decision
somewhere a scheme cannot reach. The derived form matters more than it looks —
`puzzle-view.ts` hands a game **pure white** as its background in dark mode, so a
colour that must stay legible *against the board* has to be a function of the
background, not a fixed pale value (the Spokes `COL_DONE` note below is this
rule's failure mode). The converse also holds: a colour that is *absolute* should
be a named one, because a named colour authors both schemes, where a derivation
handed pure white cannot. `errorWash(bg)` was a function for exactly that reason
and became `ERROR_WASH` once the wash step existed.

Two arithmetic traps, both worth a sentence because both cost a diff:
`scale(c, 2/3)` is **not** `(c * 2) / 3` and `scale(c, 1/1.5)` is **not** `c / 1.5`
— neither ratio is representable, so pre-computing it rounds once more. Use
`fraction(c, 2, 3)` and `divide(c, 1.5)`, which keep upstream's *operation*.

**If the colour means "this piece is black/white", use `BLACK` / `WHITE` from
`colours.ts`, not `INK` / `PAPER`.** They are the same colour, and the difference
only shows up in dark mode — which is exactly why it gets missed. `INK` is
*maximum contrast against the surface*, so it inverts, or your text ends up darker
than the tile it is drawn on. A piece's black is *the piece's own identity*, so it
is preserved: inverting it would tell the player the piece is the other colour, a
white peg where the rules say black. Five games worked this out one at a time and
pinned the index in `augmentation.ts` before it was a token (guess's pegs, mines'
and inertia's mines, pattern's squares, pearl's pearls). If your game has a
black/white *thing* rather than black/white *ink*, you now get it right for free. A
game that wants its black **lifted** rather than preserved (Light Up's wall,
invisible if left pure black) still says so in `augmentation.ts`, which wins over
the token.

**Every named colour authors both schemes; a derivation authors neither.** The
dark value rides on the array as an own property, so **assign the colour, never a
copy of it**: `[...BLACK]` is the right colour with its scheme decision silently
removed, and no test can catch that in general (an untagged `[0,0,0]` is equally
well a copied `BLACK` or a perfectly correct `INK`). One consequence worth knowing
before you touch `augmentation.ts`: a `paletteOverrides` entry aimed at an index
that now carries an **authored** dark value is no longer correcting a calculation,
it is fighting a decision. Four such entries were retired when the palette was
authored; check yours is not the fifth.

**What enforces all of this**:
[`palette-source.test.ts`](../../src/native/engine/palette-source.test.ts) reads
your game's source and fails on a colour literal, on channel-indexing the
background, on importing the colour combinators, and on importing another game's
token. [`colours.test.ts`](../../src/native/engine/colours.test.ts) measures the
palette — every set that has to stay distinguishable, in both schemes, against the
number upstream's hand-written set scored — and `palette.test.ts` checks that no
meaning has quietly become a colour of its own. If you are adding a three-number
array that genuinely is not a colour, declare it in `palette-source.test.ts`'s
`NOT_COLOURS` with a reason — it has two entries and should stay about that size.


**Mirror the C colour-enum indices when the game has dark-mode overrides.**
`src/puzzle/augmentation.ts` may carry a `paletteOverrides` map for a game keyed by
**colour index** (Unruly's `{3..8: false}` preserves its black/white tiles + bevels
under dark mode). A TS port whose palette reindexes the colours silently mis-targets
those overrides. Keep the `colours()` array index-for-index with the upstream `enum`
(Unruly: `0 BACKGROUND, 1 GRID, 2 EMPTY, 3 COL_0…5, 6 COL_1…8, 9 CURSOR,
10 ERROR`). Exemplar:
[`unruly/render.ts`](../../src/native/games/unruly/render.ts).

**Highlight/lowlight from a fixed base, not the background.** The existing
[`mkhighlight(bg)`](../../src/native/engine/colour-mkhighlight.ts) derives its trio
from the *frontend background* and never extrapolates the base. A game that calls
upstream `game_mkhighlight_specific` on a **fixed** base colour (Unruly's near-white
`COL_0` = 0.95 grey, dark `COL_1` = 0.2 grey) needs **`mkhighlightSpecific(base)`**
instead — it extrapolates the base toward the opposite extreme when the base sits
within `K` of white/black, exactly as the C. Reach for it whenever a tile colour
isn't the host background.

**Make determined state legible (deliberate divergence).** Where upstream leaves
known cells looking like undecided ones (Range painted every non-black cell the same
grey, with only a dot marking "white"), give each determined state its own fill so
the player reads the board at a glance — Range now paints a known-white cell (a clue
or a white mark) pure white via a dedicated `COL_WHITEBG`, leaving only undecided
cells grey. Derive the white from
[`colour-mkhighlight.ts`](../../src/native/engine/colour-mkhighlight.ts): it shifts
`COL_BACKGROUND` off pure white precisely so a pure-white cell stays
distinguishable. Exemplar:
[`range/render.ts`](../../src/native/games/range/render.ts).

**A "highlight" upstream draws as pure white may be invisible in this app — check
both schemes.** Spokes fills a hub whose clue is satisfied with pure white
(`COL_DONE`), which upstream's own frontends show against a grey background. Here
it reads as nothing in light mode and as *literally the background* in dark mode,
because `puzzle-view.ts` deliberately hands the game **pure white** as its
background there (so that puzzles' `background × 0.9` derivations still work) and
then adapts the returned palette itself. A cue that has to be seen must be a clear
step **away** from the background — `defaultBackground × 0.85` is enough, and greys
survive the dark-mode adaptation correctly because it inverts their lightness about
the real background. When a game's own colour equals or nearly equals
`COL_BACKGROUND`, that is a bug to fix, not fidelity to preserve (display was never
in byte-parity scope). Pair the cue with a `GamePref` when it is a solving aid
rather than game state — Bridges' `auto-mark-complete` and Spokes' `mark-satisfied`
are the same control. Exemplars:
[`spokes/render.ts`](../../src/native/games/spokes/render.ts) (`COL_SATISFIED`),
[`bridges/render.ts`](../../src/native/games/bridges/render.ts).

**Shade a completed-and-correct region with the *shared* colour, don't invent
one.** When a game highlights a region/area the player has correctly finished
(the local-completion feedback Galaxies and Rectangles give — *not* a
global-solution check), fill it with
[`correctRegionColour(background)`](../../src/native/engine/palette.ts)
(a neutral grey, `0.75 × background`, upstream Rectangles' `COL_CORRECT`
convention), placed at a `COL_CORRECT` palette index. Reach for the shared
constant rather than a per-game hue (a green invented for Separate/Palisade was
the inconsistency this rule exists to prevent) so "done and correct" reads the
same across every game; tune it in one place. Compute local validity per
wall-bounded component (right size + correct content + no interior/dangling wall),
OR an `F_CORRECT` tile-flag bit into the packed cache key (§3.2 — it must be in the
diff key so it paints and clears as regions complete/break), and prioritise it
below flash/hint fills. Exemplars:
[`separate/render.ts`](../../src/native/games/separate/render.ts),
[`palisade/render.ts`](../../src/native/games/palisade/render.ts).

**Don't "fix" a palette for dark mode — the app already owns it.** Upstream
games routinely derive a colour as `background × 0.9`, which on a *dark*
background is darker than the background and so vanishes; several upstream files
even concede the problem in a comment (`loopy.c`: *"Except if the background is
pretty dark already; then it ought to be a bit lighter. Oy vey."*). It is very
tempting to make the derivation luminance-aware in the port. **Don't.**
[`puzzle-view.ts`](../../src/puzzle/puzzle-view.ts) passes **pure white** as
`defaultBackground` in dark mode — precisely *because* puzzles multiply the
background down — and then adapts the whole returned palette in OKLCH, with
per-puzzle `darkMode.paletteOverrides` from
[`augmentation.ts`](../../src/puzzle/augmentation.ts). So `colours()` never sees
a dark background: a luminance test there is dead code, and a second adaptation
inside the game fights the layer that owns the concern. Derive exactly as
upstream does and record *why there is no divergence*. (This overturned a
written design decision on `add-loopy-ts-port`; see its `design.md` F3.)
Exemplar: [`loopy/render.ts`](../../src/native/games/loopy/render.ts).

**A param-dependent capability the static `Game` flag can't express: widen the
return, don't add a hook.** Upstream has `game_can_format_as_text_now(params)`;
the `Game` interface has a static `canFormatAsText`. Loopy's text format works
on the square lattice and on none of its other seventeen tilings. The cheapest
resolution — and the right one — was to widen `Game.textFormat` to return
`string | undefined`, since `Midend.formatAsText` and the share dialog already
treat an absent rendering as "no text panel". Adding a
`canFormatAsTextNow?(params)` hook would have been a wider surface for one
adopter, which is the `PointerAction` mistake (a hook shipped with no adopter,
later deleted as phantom API).

### 3.4 Params, config summary, preferences

**A `float` param is a byte-match hazard: reproduce `%g` and `atof`, and round to
single precision.** Most params are ints, but a few are C `float`s (Netslide's
`barrier_probability`; Net's is the same field). Three things then bite at once,
and all three change the *board*, not merely the label — Netslide places
`(int)(barrier_probability * candidateCount)` barriers, so a value off by one ulp
can be off by one wall:
- **`encode_params` writes it with `%g`**, which is six significant digits with
  trailing zeros stripped — *not* `String(x)`, which would render 1/3 as
  `0.3333333333333333` and change what `decodeParams` reads back. Port a small
  `formatG` (netslide's `state.ts`).
- **`decode_params` reads it with `atof`**, which yields **0** for garbage.
  `Number.parseFloat` yields `NaN`, which slips past every `<`/`>` bound check in
  `validateParams` — the same trap `parseConfigInt` exists to close for ints.
- **The value is a `float`, not a `double`.** Store what C stores: `Math.fround`
  at every boundary that admits one (`decodeParams`, the `paramConfig` `set`), and
  again at the arithmetic C does in single precision.

**A game whose params aren't plain `w`/`h` must make `describeParams` emit the exact
keys its `augmentation.ts` `describeConfig` template reads — or the header shows the
literal template.** The config-summary formatter (`configFormatter`) substitutes
`{field}` → `String(values[field])` and `{field:A|B|C}` →
`options[Number(values[field])]`; a missing key is left as the literal `{field}`
text. So Towers' template `"{grid-size}x{grid-size}
{difficulty:Easy|Hard|Extreme|Unreasonable}"` needs `describeParams` to return
`{ "grid-size": String(w), difficulty: <0-based level index> }` — **the slug the C
`game_configure` name produces** (`"Grid size"` → `grid-size`), and a *numeric
index* for a `{…:A|B}` choice, not the label string. The worker adapter's generic
`{ width, height }` base only covers `w`/`h` games; a square-grid or
oddly-named-param game (Towers, Keen, Solo, Unequal) supplies its own keys. A
permanent guard exists: [`augmentation.test.ts`](../../src/puzzle/augmentation.test.ts)
fails on any unsubstituted `{field}` for any TS game (caught on the Towers dev smoke,
and singles/cube/untangle were fixed under it).

**The "Custom type…" dialog comes from `Game.paramConfig` (since
`add-ts-custom-params-config`).** `describeParams` above only feeds the type-menu
*summary string*; the editable **form** is a separate optional hook, declarative like
`prefs` but over `Params`: an ordered `ParamConfigItem<Params>[]`, each
`{ kw, name, type: "string" | "boolean" | "choices", choices?, get(p), set(p, v) }`.
The midend builds the app's `ConfigDescription` from it and parses a submit back onto
a **copy** of the params, validated by the game's own `validateParams` (so the dialog
rejects exactly what a game ID would). A plain w/h game is one line —
`paramConfig: dimensionParamConfig()` (from `engine/params.ts`); a game with extra
fields spreads that then appends. **Conventions that keep it correct:**
- **Keys match the C config slug** (`"Width"`→`width`, `"Grid size"`→`grid-size`,
  `"Difficulty"`→`difficulty`), so a TS and a C build show the identical form. `get`
  mirrors `describeParams` (index for a choice, string for a numeric field); `set` is
  its inverse (a `diffFromLevel`, `v === 1 ? "adjacent" : "unequal"`, etc.).
- **Numeric `set` uses `parseConfigInt(v)`, never `Number.parseInt`** — atoi
  semantics: empty/garbled → 0, which `validateParams` then rejects with its message.
  `Number.parseInt` yields `NaN`, which slips past every `<`/`>` bound check.
- **Never hand-write the width/height pair.** Every game with two dimensions calls
  `dimensionParamConfig()`; a game that spells its fields differently passes the
  field map — `dimensionParamConfig<MosaicParams>({ w: "width", h: "height" })`,
  `dimensionParamConfig<UnrulyParams>({ w: "w2", h: "h2" })` — rather than being
  renamed to fit (`adopt-declarative-config-helpers`; a game contorted to satisfy a
  shared contract is the failure the guardrails exist to prevent, and a helper only
  *most* games call is drift with a helper's name on it). Square games
  (Keen/Towers/Unequal, Solo `c`/`r`) supply a single size item instead.
- **Cross-field folds run in array order** — the midend applies each `set` in order,
  so Solo's `jigsaw` item (`c *= r; r = 1`) must come *after* its column/row items,
  matching upstream `custom_params`.
- **The round-trip guard** (`custom-params.test.ts`) drives every registered game's
  presets through `get`∘`set` and asserts identity — it catches a wrong inverse for
  free, but *not* a wrong label/choice list, so eyeball those against
  `augmentation.ts`. It is also **blind to a swapped field map**: `get` and `set`
  name the same field, so the round trip is the identity whether "Width" drives
  `w2` or `h2`. A game passing a field map therefore asserts the mapping directly,
  where the fact lives — see the `drives w2/h2 from the shared Width/Height dialog
  items` test in [`unruly.test.ts`](../../src/native/games/unruly/unruly.test.ts).
  The general lesson: *a test whose only observer is the thing under test cannot
  establish ground truth.*
Exemplars: [`pattern/index.ts`](../../src/native/games/pattern/index.ts) (pure w/h),
[`towers/index.ts`](../../src/native/games/towers/index.ts) (size + difficulty),
[`solo/index.ts`](../../src/native/games/solo/index.ts) (the jigsaw fold).
**Gotcha (cost a dev-verify cycle):** the type-menu *label* reads `currentParams`,
which derives from the `params#seed` random-seed the midend emits — that seed must be
`encodeParams(_, true)` (full, incl. difficulty), or a custom difficulty shows as the
default in the header even though the board generated correctly. Fixed in
`Midend.emitIdChange`; if a new game's header ignores a suffix, check that first.

**Per-game preferences go through the `Game.prefs` hook (since Untangle).** A game
with upstream `get_prefs`/`set_prefs` declares an optional `prefs: GamePref<Ui>[]` —
each item is `{ kw, name, type: "boolean" }` or
`{ kw, name, type: "choices", choices }` plus `get(ui)`/`set(ui, v)` accessors.
**Preferences live on the `Ui`** (upstream stores them on `game_ui`, and the game's
`interpretMove`/`redraw` read them off the ui), so `newUi` sets the **defaults** —
that is the place to ship a deliberate divergence (Untangle's crossed-edge highlight
defaults ON). The midend builds the app's existing preferences dialog from these,
persists per-puzzle in IndexedDB, and re-applies a player's choices after each
`newUi`; the app shell needs **no change**. A `choices` value is the **zero-based
index** (the form emits `Number.parseInt`), a `boolean` value a real boolean.
Exemplar: [`untangle/index.ts`](../../src/native/games/untangle/index.ts) (`prefs`)
+ [`untangle/state.ts`](../../src/native/games/untangle/state.ts) for the ui fields.
**Gotcha (cost a dev-verify cycle):** a pref that changes only rendering moves none
of the keys a game's `redraw` early-out watches (positions/bg/cursor), so the midend
drops the drawstate on `setPreferences` to force a full repaint — your `redraw` needs
no special handling, but don't be surprised the repaint is full.

**The app overrides `newUi` pref defaults per-puzzle — verify against that layer.**
`src/store/settings.ts` `getPuzzlePreferences` carries a small hardcoded `defaults`
map (a web-app divergence inherited from the C frontends — e.g.
`pencil-keep-highlight: true` for keen/solo/towers/undead) that the app passes to
`setPreferences` on every puzzle load, *overriding* your game's `newUi` default. So
on a dev smoke-test a checkbox can legitimately come up checked even though your
`newUi` sets it `false` — that is the app's intended default, not a port bug (the
C/WASM build shows the same). Match upstream's struct default in `newUi` regardless;
if a default looks "wrong" on smoke-test, check this map before chasing your hook.
(Towers spent a verify cycle here.)

### 3.5 The solvable-game contract: ship `findMistakes`

**A game with a unique solution MUST ship `findMistakes` — Check & Save depends on
it.** The shell's Check & Save control (`quick-save-actions.ts`) hard-blocks a save
**only when `canFindMistakes` is true**, which is exactly
`game.findMistakes !== undefined` (`midend.ts`). A uniquely-solvable game with no
`findMistakes` therefore reports `canFindMistakes` false: the control silently
degrades to a plain "Quick-save" and **saves a wrong board without complaint** (this
shipped in Unruly's first cut, caught on owner smoke-test). So for any game with a
unique solution, `findMistakes(state)` is part of "done": re-solve from the fixed
clues to the unique solution and return every player cell that contradicts it (`[]`
when the board isn't uniquely deducible). Render the flagged cells with a distinct
overlay (a packed cache bit + an inset error outline; remember §3.2 — the overlay
must be in the diff key). Exemplar:
[`unruly/solver.ts`](../../src/native/games/unruly/solver.ts) `findMistakes` +
[`unruly/render.ts`](../../src/native/games/unruly/render.ts). The hook + refusal
coupling are detailed in [hint-authoring.md](./hint-authoring.md); a permutation
puzzle with no notion of a wrong-but-legal state correctly omits it.

**For a *region-drawing* game, flag the player's *edges* that contradict the
solution — not "the cell looks invalid".** Where the player draws walls
(Rectangles, and Tracks earlier), re-solve to the unique solution's edge grid and
flag every edge the player has **set** that the solution does **not** contain — a
definite mistake. A *missing* solution edge is merely incomplete, never a mistake,
so a partially-drawn-but-correct board (some right walls, no complete rectangle
yet) correctly reports zero. This is subtler than a cell-validity check: a
2×2 box the player draws around no number *looks* wrong, but if each of its walls
is a real solution boundary it is legitimate partial progress — only a wall the
solution forbids (e.g. one boxing a 7-clue into a 1×1) is flagged. Recolour the
flagged walls with a `COL_MISTAKE` index and fold the wrong-edge bits into the
per-tile cache word (§3.2) so they paint and clear like any overlay. Exemplars:
[`rect/index.ts`](../../src/native/games/rect/index.ts) `findMistakes` +
[`rect/render.ts`](../../src/native/games/rect/render.ts),
[`tracks/index.ts`](../../src/native/games/tracks/index.ts).

**When the C already draws live rule errors, ship *both* layers — they are not
alternatives.** Boats colours a broken row count, a diagonal boat collision, an
over-populated fleet and a contradicted given clue as you play, with no solver
call. It is tempting to make `findMistakes` return exactly those and be done.
Don't: the live checks are a **strict subset**, and the gap is the dangerous
one — a player can put a locally-legal boat on a square the unique solution has
as water without yet breaking any rule, and a live-only hook would let Check &
Save bless that board (the §3.5 failure again). Keep the live errors (they are
free, immediate, and what the C build showed) *and* base `findMistakes` on the
re-solve. Render them so both read: Boats recolours a wrong **ship** red and
additionally insets a red outline, which is what makes a wrong **water** square
— which has no ship to recolour — visible at all. Exemplar:
[`boats/render.ts`](../../src/native/games/boats/render.ts).

**For a *self-validating* game, `findMistakes` is the rule checker — not a
re-solve.** Some games' rule violations are *intrinsic to the current grid*: the
same validity pass that decides won/ongoing already localises every broken rule.
There `findMistakes` runs that one pass and returns the offending cells with their
error flags, rather than re-solving to the unique solution (Bricks: three-in-a-row
bars, gravity diamonds, over-count clues; Subsets: duplicate/violated-edge marks).
This is *weaker* than a re-solve — a shade that is wrong but not yet rule-breaking
won't be caught — but it is the right choice when the game **already displays those
same marks live** (Bricks reds a clue and draws the error bar the instant a drag
creates a violation): findMistakes and the live overlay then share one validity
function, so Check & Save flags exactly what the board already shows. Reuse the
flags for the overlay (Bricks passes the drag-preview grid *or* the `mistakes`
param through the same `bricksValidate(grid, …, errors)` and draws whichever is
present; upstream shows live errors only mid-drag, so a committed frame carries
none until Check & Save asks). Exemplars:
[`bricks/solver.ts`](../../src/native/games/bricks/solver.ts) `findMistakes` +
[`bricks/render.ts`](../../src/native/games/bricks/render.ts),
[`subsets/index.ts`](../../src/native/games/subsets/index.ts). Contrast Galaxies,
whose mistakes are only meaningful against a re-solve.

### 3.6 `solve()` and the generator's `aux`

**A `solve()` that needs the generator's `aux` only works on a freshly generated
game.** The midend retains the `aux` from `newDesc` and passes it to
`solve(orig, curr, aux)` — but only for `newGame`/`#seed` (a `:desc` id or a loaded
save has no aux, so Solve correctly reports "not known", faithful to upstream). Most
ports re-derive the solution in `solve` and ignore `aux`; reach for `aux` only when
re-derivation is impractical (Untangle stores the untangled layout). If you take
`aux`, test Solve **through a real `Midend`** (not just the game's `solve`
directly), since the threading lives in the midend — a direct unit test of
`solve(…, aux)` passes while the shipped Solve is a no-op.

**Solve MUST complete the game — fix upstream's bookkeeping when the C forgot it
(owner directive, 2026-07-21).** The collection convention is that the solve
move's `executeMove` arm runs the completion check (so the game reports
solved-with-help) **and** sets `cheated` (so the win flash doesn't fire on a
solver fill). Most upstream games do both in their `'S'` arm, but not all:
`subsets.c` returns from its `'S'` branch *before* the completion check and never
sets `cheated`, so upstream Subsets stays "ongoing" for ever after Solve. Do
**not** preserve that class of quirk for faithfulness — it is missing
bookkeeping, not behaviour, and a port that keeps it is inconsistent with every
other game in the app. This is safe to fix even on a byte-match port: the desc
differential exercises only `newDesc`/solver/codec, never `executeMove`. Assert
both halves through a real `Midend` (status `"solved-with-help"`, `flashLength`
0). Exemplar: [`subsets/index.ts`](../../src/native/games/subsets/index.ts)
(`executeMove`'s solve arm, with the divergence comment).

### 3.7 Pencil-mark games: ship the full note-taking UX (Towers exemplar)

Any game with candidate pencil marks — Towers, and Solo / Keen / Unequal / Undead
when ported — should carry all four of the following. They are deliberate, default-on
divergences that make note-taking usable with mouse/touch, not just the keyboard.
Exemplar: [`towers/{state,index,render}.ts`](../../src/native/games/towers/index.ts).

- **Mark-all button — `canMarkAll: true`.** The game already handles upstream's
  `M`/`m` key in `interpretMove` (fill every empty cell with all candidates); the
  optional `readonly canMarkAll` `Game` flag surfaces that as a toolbar button (grid
  icon, next to Check & Save) that injects `M` via `processKey`. Plumbed like
  `canHint`/`canFindMistakes` (`midend.getStaticProperties` →
  `PuzzleStaticAttributes` → `Puzzle`); the C/WASM path reports false.
  - **Adaptive mark-all (fill, then clean) for row/col-uniqueness games** —
    `add-pencil-cleanup-on-markall`. A *candidate-elimination* game (one with a
    `regionsOf`, §9 of hint-authoring) routes its `M` handling through
    `adaptiveMarkAllMove(grid, pencil, w, regionsOf)` (`engine/candidate-hint.ts`)
    instead of always returning `{ type: "pencilAll" }`: a press fills note-less empty
    cells (today's behaviour), but on an already-fully-noted board it strikes each
    cell's *obvious* candidates — values already placed in one of that cell's
    uniqueness regions — as one atomic `pencilStrike`. It returns `null` when there is
    nothing to fill or strike, so a redundant press is a true no-op (no undo entry). The
    cleanup is idempotent and defined off the *placed* grid (never inferred from another
    note), with a guard that never empties a cell's last note. Use the same `regionsOf`
    the game's hint uses (Keen: row/col only — a cage is **not** a uniqueness region);
    games without a row/col model (Undead) keep plain fill-only.
- **Declare the pencil preferences from `engine/pencil-prefs.ts`, never by hand.**
  `stickyPencilPref<Ui>()` and `pencilKeepHighlightPref<Ui>()` carry the wording ten
  and five games respectively share; `autoPencilPref<Ui>(name)` takes the label as an
  argument *because* its sentence names the regions the game clears ("its row, column
  and block" in Solo, "its row and column" in Keen, and Towers places a *tower*).
  Sharing only the keyword and plumbing is the honest amount to share
  (`adopt-declarative-config-helpers`); a label copied is a label that drifts, and
  this one is player-visible. `pencil-prefs.test.ts` fails on a divergent copy.
- **Sticky pencil mode — a `pencilSticky` `Ui` boolean (default true) via the
  `prefs` hook.** When on, right-click *toggles* a persistent pencil mode and
  left-click only moves the highlight (don't reset the pencil flag); when off,
  behaviour is exactly upstream. The keyboard is already mode-persistent, so this
  only unifies the mouse with it. A right-click on a **filled/given cell** must
  toggle the mode but **not** select or restyle that cell (it can't take a mark, so
  highlighting it just confuses) — only move the highlight onto an empty, editable
  cell.
- **A CapsLock-style mode indicator** — a small pencil glyph drawn somewhere fixed
  whenever pencil mode is on, so the player always sees the mode. **A game with no
  border and no spare cell should grow the canvas rather than overlap the board**:
  Mathrax compiles the `NARROW_BORDERS` arm (`BORDER = 1`, so no border to draw in)
  and every one of its cells can carry a digit, a full pencil grid *and* up to four
  clue circles, so there is no cache-safe cell either — it adds a `tilesize/2` strip
  *below* the board and puts the glyph there. Keep the grid's own geometry untouched
  when you do, so `fromCoord` and the width stay exactly upstream's and only the
  height changes. Otherwise the cheapest robust encoding is a high tile-flag bit on a
  board cell the game's own draw never overpaints
  (no piece/animation overlap) **and** that is no cell's neighbour in the diff cache,
  so the per-tile cache repaints it on toggle for free (Towers uses the top-right
  clue-ring corner — its 3D towers only ever protrude up-left). A game with no such
  cache-safe cell instead repaints the indicator's region explicitly at the end of
  every `redraw` (fill background, draw the glyph if on), tracking the last-drawn
  on/off on the drawstate. Draw the glyph as a yellow #2-pencil body + graphite tip;
  the body colour is a palette index appended past the upstream enum — safe only when
  the game has no dark-mode `paletteOverrides` touching that index (check
  `augmentation.ts`).
- **Notes are first-class markings in `findMistakes` (the cross-game convention).**
  When the game implements `findMistakes`, an empty cell whose **non-empty** pencil
  notes have crossed out the cell's unique-solution value is a mistake
  (`kind: "note"`), exactly as a wrong placed value is (`kind: "cell"`) — both render
  as the same red overlay, and Check-&-Save refuses to quick-save while either exists
  (it inherits this through the existing `findMistakes` gate, no quick-save change). A
  note with merely *extra*, non-solution candidates is ordinary mid-solve state and
  is **not** flagged. Derive the solution from the placed givens/entries only — never
  from the notes (a note can be wrong; that is what is being checked). This is the
  template for Solo / Keen / Unequal / Undead. Normative: the `findMistakes`
  requirement in [`ts-engine`](../../openspec/specs/ts-engine/spec.md).
  - **Carve-out: this only holds where notes *are* candidates.** Rome's marks
    are the same four arrow directions its solver uses as a candidate set, so
    the convention looks like it applies — but the game's own docs say its
    pencil marks "can be used for any purpose", and a player as likely marks
    what they have ruled *out*. With no agreed meaning there is no reading of a
    note that can be called wrong, so Rome checks placed arrows only. Read the
    game's documentation (§1.0) before applying this rule; where you decline,
    record the reason in `design.md`.

The **explained, pencil-notes-based hint** these games want is its own change — see
the "candidate-elimination games" section of
[`hint-authoring.md`](./hint-authoring.md), with Towers as the exemplar.

### 3.8 On-screen keypad — restore it on the TS path (`requestKeys`)

Any game upstream gave a virtual keypad (defines `game_request_keys`) **loses it the
moment it goes `TS_PORTED`** unless the port implements the optional
`requestKeys?(params): KeyLabel[]` `Game` hook — the worker adapter forwards
`Game.requestKeys` through `Midend.requestKeys()`, and an absent hook means an empty
keypad (correct for games upstream gave none, like Flip). On touch this panel is the
*primary* digit-entry affordance, so it is not optional for a keypad game. Exemplars:
the five digit games (`solo`/`keen`/`towers`/`unequal`/`filling`) and Undead.

- **Digit games use the shared helper.** `digitKeys(n)` in
  [`engine/key-labels.ts`](../../src/native/engine/key-labels.ts) builds buttons
  `'1'..'9'` then `'a','b',…` past nine, plus a clear key `{ button: 8, label:
  "Clear" }` (the `"Clear"` label is load-bearing — it's what the `puzzle-keys` icon
  map turns into the clear icon). Size `n` from params: Solo `c*r`, Keen/Towers `w`,
  Filling fixed `9`.
- **Match the C keypad exactly — including its quirks.** The bar is parity with the C
  build's keypad, so read upstream's `game_request_keys` rather than assuming
  `digitKeys` fits. Unequal is the cautionary case: it allows order up to 32 and
  switches to a **`'0'`-based** keypad for order ≥ 10 (`'0'..'9'` = values 1..10, then
  `'a',…`), faithful to its `c2n`/`n2c`. So it gets a bespoke `unequalKeys(order)`,
  *not* `digitKeys`. Games with explicit labels (Undead's Ghost/Vampire/Zombie) carry
  those strings verbatim.
- **The hook takes `params` only.** The keypad doesn't vary with play and the panel
  reloads only on param change — so don't thread state/ui through it.
- **Test it tier-1.** Pin the returned `KeyLabel[]` (buttons + labels) for
  representative params in the game's existing test file; assert the `digitKeys`
  rollover and any per-game quirk (Unequal's `'0'`-based high range). Normative: the
  on-screen-keys requirement in [`ts-engine`](../../openspec/specs/ts-engine/spec.md).

### 3.8a–d Input: four things this frontend does that upstream never tells you

Upstream's `interpret_move` contract does not survive contact with a browser
untouched. Each of the next four subsections is a trap that has already cost this
project a shipped bug — read them before writing a game's input, not after.

### 3.8a `MOD_NUM_KEYPAD` never arrives — bind the bare digits too

**This web frontend does not set `MOD_NUM_KEYPAD`.** `puzzle-view-interactive.ts`'s
`puzzleKeyMap` handles the arrow/select/delete keys and then falls through to "any
single character → its char code", so a number-pad `7` reaches `interpretMove` as the
plain character `'7'`, never as `MOD_NUM_KEYPAD | '7'`. A port that faithfully
transcribes an upstream `interpret_move` testing `button == (MOD_NUM_KEYPAD | '7')`
therefore ships a **key binding that can never fire** — and the C build has the same
dead binding, so it doesn't show up as a parity difference either.

It bites hardest where the keypad is the *only* route to some input: Inertia's four
diagonal moves are keypad-or-mouse upstream, so with the modified-only binding a
keyboard-only player literally cannot make them. Accept the **bare digits as well as
the modified ones** (`stripModifiers(button)` then look the character up) whenever the
game binds no other meaning to those digits — a deliberate divergence that costs
nothing and restores the input. Grep a game's `.c` for `MOD_NUM_KEYPAD` before porting
its input, and say what you did in `design.md`. Exemplar:
[`inertia/index.ts`](../../src/native/games/inertia/index.ts) (`DIGIT_DIRECTIONS`).

**The same trap, one layer up: a whole *feature* can hang off a key this frontend
never sends.** Slide's Solve doesn't fill the board in — it installs a shortest
route the player walks one step at a time, and upstream binds that step to
`button == ' '`. `puzzleKeyMap` maps Space to `CURSOR_SELECT2` and Enter to
`CURSOR_SELECT`, so the bare space character never arrives: a faithful
transcription ships a route that literally cannot be walked, and the C build has
the identical dead binding so it never shows up as a parity difference either. When
a game's `interpret_move` compares `button` against a **character literal**, check
`puzzleKeyMap` before porting it; the fix is to accept the buttons the frontend
does deliver (keeping the literal too costs nothing). Exemplar:
[`slide/index.ts`](../../src/native/games/slide/index.ts) (`isStepKey`), and
Inertia does the same for its route-following with `CURSOR_SELECT`/`SELECT2`.

### 3.8b Touch: the midend strips `MOD_STYLUS` for you (and a guard proves it)

`puzzle-view-interactive.ts` ORs **`MOD_STYLUS` (0x0800)** into the button for every
press, drag and release whose `pointerType` is `touch` or `pen`. Upstream's `midend.c`
hands that bit straight to `interpret_move` and expects each game to strip it
(`net.c` does; `inertia.c` doesn't). **Nine of this collection's first thirty-two
ports forgot** — Flip, Galaxies, Pegs, Blackbox, Dominosa, Guess, Signpost, Untangle,
Inertia — and every one of them shipped *completely deaf to touch*, because
`button === LEFT_BUTTON` simply never matches `LEFT_BUTTON | MOD_STYLUS`. It reads
correctly, it fails silently, and it fails only on a device the suite never uses.

So the contract is inverted here (`fix-touch-input-stylus-modifier`): **the midend
strips `MOD_STYLUS` before `interpretMove`**, and a game that genuinely wants it opts
in with `Game.wantsStylusModifier` (Pattern is the only one — with no right button to
hand, a touch press cycles a cell through its three states). You therefore need to do
*nothing*: compare the plain button and touch works.

Two things follow for a port. Don't reintroduce the bit by hand — if you catch
yourself writing `button & 0x0800`, you want the flag instead. And know that
[`engine/touch-input.test.ts`](../../src/native/engine/touch-input.test.ts) sweeps
**every registered game** asserting a touch press does what the same mouse press does,
so your port is covered the day you register it. If it fails, your `interpretMove` is
looking at a raw button somewhere.

### 3.8c A touch *hold* arrives as the right button — which breaks drag gestures

`detectSecondaryButton` (`src/utils/touch.ts`) gives touch a long-press-for-secondary
affordance: a finger that stays within 8px for **350ms** is delivered to the game as
`RIGHT_BUTTON` (and its drag/release follow suit), not `LEFT_BUTTON`.

That is a trap for any **press-and-drag gesture**, because "press, pause a moment to
decide, then drag" is *exactly* a press that stays put — so the gesture dies precisely
when the player stops to aim, and only on touch. Inertia's swipe (hold the ball, drag
out the direction, let go) hit this. The fix is one line: if the game has no use for a
secondary button, **fold right onto left** at the top of `interpretMove`
(`asPrimary()` in [`inertia/index.ts`](../../src/native/games/inertia/index.ts)), so
the gesture works whichever the long-press detector decides it saw. A game that *does*
use the right button has to think harder — most likely by keeping the drag on the
button the press arrived with.

### 3.8d The board keeps the keyboard after a control is pressed

You can rely on this now, but it was not always true, so know what it is doing for you:
pressing a control (a game-menu command, a `data-command` button, a toolbar button)
**hands keyboard focus back to `puzzle-view-interactive`**. Before
`fix-board-focus-after-command`, a menu left focus on its trigger button and a clicked
toolbar button kept focus on itself, so one click made the board deaf to the keyboard
until you clicked it again — Enter reopened the menu, and the cursor keys went nowhere.

It matters most to a game whose aid is a *keyboard* loop over a *menu* command —
Inertia's route-following (pick Solve, then press Enter repeatedly to walk the route)
is unusable without it. If you build any such flow, the normative rule is the
`app-shell` spec's "Pressing a control gives the keyboard back to the board"; the two
carve-outs are a click that opens a menu (the menu needs the focus) and a keyboard
activation of a button (that player is in the tab order deliberately).

### 3.8e The accreting-drag paint model (Clusters exemplar; bricks/sticks share it)

Distinct from Pattern's *rectangle*-fill drag (§ its `interpretMove`): the
x-sheep grid games (Clusters, and bricks/sticks when ported) accrete an
**arbitrary set of cells the pointer passes over** and commit them as one move on
release. The upstream shape is a `game_ui` carrying `int dragtype` (the value
being painted, `-1` when idle) + an `int *drag` accreted-index list, and it maps
cleanly to two `Ui` fields (`dragType: number`, `drag: number[]`) plus this
lifecycle in `interpretMove`:

- **press** (`isMouseDown`, after coordinate bounds-check): reset `dragType=-1`,
  `drag=[]`, then pick `dragType` by *cycling the pressed cell's* current value
  (left and right cycle opposite ways) and seed `drag` with the pressed cell;
  return `UI_UPDATE`.
- **drag** (`isMouseDrag`, guarded by `dragType !== -1`): skip a cell already in
  `drag`, already the drag value, or a no-op-clear; else push it; `UI_UPDATE`.
- **release** (`isMouseRelease`, `drag.length > 0`): build one move from the
  accreted cells (filtering givens/immutables), else `UI_UPDATE`.

The drag continuation keys off the *button class* (`isMouseDrag`), not the exact
press button, so a touch long-press that arrives as `RIGHT_BUTTON` (§3.8c)
continues its own drag correctly — reason about that rather than folding right
onto left when the right button carries meaning. The renderer previews the drag
by recolouring `drag` cells to `dragType` in the cache key (put it in the diff
key — §3.2). Use the shared
[`isMouseDown`/`isMouseDrag`/`isMouseRelease`](../../src/native/engine/pointer.ts)
(upstream `IS_MOUSE_*`, extracted with Clusters — 27 ports had each rewritten the
three-constant `===` chain). Exemplar:
[`clusters/index.ts`](../../src/native/games/clusters/index.ts). **Sticks
landed and the promotion was evaluated and declined** (its `design.md` F7):
Sticks' drag machine is materially different — the press picks no paint value
(the orientation comes from the *drag axis*, a `DRAG_DELTA` bounding-box
test), each accreted cell stores its own per-cell value re-writable on
re-crossing, and a matching-line start flips the whole drag into a clearing
drag. Only "accrete + commit on release" is shared, which is too little to
fix a callback shape over. If bricks' drag proves Clusters-like, revisit
against Clusters alone. One input idiom Sticks did add: its `FROMCOORD` is
*truncating* division, so it uses `Math.trunc`, not the shared `fromCoord`
floor — a pointer just inside the border maps to row/column 0, as in C.

**Bricks landed and *is* Clusters-like** (`bricks/index.ts`): a single uniform
`dragtype` (the pressed cell's cycled colour) painted across every accreted cell,
committed as one `{kind:"paint", cells}` move on release — exactly the two-field
lifecycle above. It still didn't warrant promoting a shared skeleton over
`clusters` alone (two consumers, and Sticks already declined), so the extraction
stays deferred; but bricks confirms the *shape* generalises past Clusters. Its
`interpretMove` is a close read of the C — the only novelty is the coordinate
conversion (§3.13).

### 3.9 Reference aid — an inventory checklist + click-to-highlight (Dominosa exemplar)

A game with a **fixed, enumerable inventory of pieces** the player tracks by hand
(Dominosa: place each of the `(n+1)(n+2)/2` distinct dominoes exactly once) can offer
a **reference aid** — a non-blocking side panel listing every piece with found status,
where clicking a piece spotlights its candidate placements on the live board. It is a
deliberate learning-aid divergence, gated behind an explicit toolbar button next to
Hint, like Solve — so surface it when the game's core bookkeeping is "which pieces have
I used?" (Dominosa, and later plausibly Magnets).

The seam is generic (only Dominosa implements it today), mirroring `canMarkAll`:

- **Two optional `Game` hooks.** `reference(state, ui): ReferenceModel` returns a plain
  checklist — `items: { key, label, pips?, status: "outstanding" | "placed" | "conflict" }[]`
  plus `selected` — derived **purely from the player's own placements**, never the
  solution (zero leak; it is the paper accounting). `selectReference(ui, key): boolean`
  spotlights an item by mutating `Ui` and returns whether it changed.
- **It flows the `canMarkAll` chain.** Presence of `reference` surfaces a static
  `hasReference` flag (`Midend.getStaticProperties` → `PuzzleStaticAttributes` → `Puzzle`
  → the `data-command="toggle-reference"` toolbar button + game-menu item). Two new
  engine-surface methods carry it across Comlink: `getReference()` and
  `selectReference(key)`. `selectReference` is the **first clean app→`Ui` push channel** —
  shaped like a `UI_UPDATE` (repaints, but no move / no history / not serialised) — rather
  than injecting a synthetic key. WASM games report `hasReference:false`.
- **The panel is `src/components/reference-panel.ts`** (generic; renders `pips` as a mini
  domino or falls back to `label`). It is **non-blocking and responsive** — side-docked when
  there is room, a bottom sheet on a narrow viewport **or** in the app's short-landscape
  "horizontal" orientation, board interactive in both (no modal). It reserves space via
  `main.reference-open` padding (`padding-inline-end` for the dock, `padding-block-end` for
  the sheet) so the ResizeController-driven canvas reflows and stays fully visible. Watch the
  orientation: in "horizontal" `main` is a flex *row* with the toolbar as a right column, so a
  side dock's `padding-inline-end` shoves the board off-centre into a dead gap — use the sheet
  there (the panel `:host` media query and the padding rule share the
  `(orientation: landscape) and (max-height: 40rem)` condition from `common.css`). It refetches
  `getReference()` on every board change so the checklist ticks off live.
- **The board highlight is a per-game `Ui` field + render bit.** Dominosa's
  `DominosaUi.highlightPair` (a domino index) drives a `COL_REFERENCE` box around each
  candidate cell in `render.ts` — a new colour appended past the palette and a new bit
  folded into the packed cache key (§3.2), reset with the other highlights on completion.
  Panel selection and board box share the colour so they read as one.
- **Drive the render frame in-process** with `renderScenario({ …, selectReference: key })`
  (the harness gained the option) and assert `COL_REFERENCE` rects appear only with a
  selection. Normative: the reference-aid requirement in
  [`ts-engine`](../../openspec/specs/ts-engine/spec.md); exemplar
  [`dominosa/`](../../src/native/games/dominosa/).

**When the inventory is already drawn on the board, make it an *input* surface
rather than a side panel.** Crossing draws its clue list under the grid because
upstream does; the port made that list clickable — pick a clue up, see it ghosted
into every run that can still take it, click one to write the whole clue in as a
single move (and, with a cell already selected, clicking a fitting clue places it
at once). No new panel, no new engine seam: it is `interpretMove` hit-testing
pixels the game already paints. Two rules make it safe:

- **Share the layout with the renderer.** Export the function that positions the
  inventory (`layoutNumbers` in `crossing/render.ts`) and have both `redraw` and
  `interpretMove` call it, exactly as §3.13 requires for a sheared grid — a
  private copy in the input path is a drift bug waiting to happen.
- **Decide what "available" means, and stop there.** Crossing offers a clue when
  it is the right length, agrees with the digits already typed, and isn't used
  elsewhere — pattern-matching over the player's own entries. Testing whether it
  would leave the *crossing* runs satisfiable is constraint propagation, i.e. the
  puzzle, and belongs to `hint()`. The stronger version is barely more code,
  which is exactly why the line needs stating.

Also worth knowing when a game already spends its gestures: **Ascent's ghost
grammar (left-click accepts a previewed value, right-click cycles alternatives)
does not transplant freely.** In Crossing both gestures were taken — a repeat
left-click flips the fill direction, right-click toggles sticky pencil — so
picking the value from a visible inventory replaced cycling altogether, and
showed *all* the candidates instead of one at a time. Check what a gesture
already means before borrowing an interaction from another game.

---

### 3.10 A board that isn't decided until play starts (`supersededDesc`)

Mines generates its mine layout on the **first click**, so the first click is never a
mine — the desc the player started from describes no layout at all, and must be replaced
once the real board exists (upstream `midend_supersede_game_desc`). If you are porting a
game like that, implement `Game.supersededDesc(state)`: the engine asks, after every
committed move, *what desc describes the board this state belongs to*, and adopts the
answer. It **pulls** rather than letting the game push, so `executeMove` stays pure and no
game needs a midend back-reference.

Three things the engine guarantees, so you don't re-derive them
([`ts-engine` spec](../../openspec/specs/ts-engine/spec.md), "A game can supersede its
game description mid-play"):

- Answer `null` for "nothing to say" — **never** to revert. Undoing past the generating
  move keeps the desc: a desc describes the *game*, not the position.
- Return a `privDesc` when your public desc bakes in the move that generated the board
  (Mines' public desc names layout *and* first click). The engine rebuilds state 0 from it
  on load, so the move log replays against the board it was played on.
- Restart rebuilds from the *public* desc, so the player restarts to just after the
  generating move rather than to a blank board they'd have to re-guess.

Make the generation a deterministic function of state + move (put the generator's RNG in
the state), or the move log will not replay. Do it in **one controlled shared box**: Mines'
mine layout is a mutable holder shared by reference across every cloned state, filled once
on the first click and surviving undo (so you can't re-roll the board) — the sole deliberate
`executeMove` impurity, and it must be commented *at the mutation site* (it's a memoisation
of a deterministic function of the desc RNG + click, so replay reproduces it byte-for-byte).
Exemplar: [`mines/index.ts`](../../src/native/games/mines/index.ts) (`openSquare` +
`supersededDesc`) with the shared box in
[`mines/state.ts`](../../src/native/games/mines/state.ts) (`MineLayout`); the fake game in
[`desc-supersede.test.ts`](../../src/native/engine/desc-supersede.test.ts) is Mines' shape
in miniature.

### 3.11 A timed game, and Ui state a save-replay can't rebuild (Mines)

Mines was the first two firsts at once: the first `isTimed` TS game, and the first with
`Ui` state that must survive a save. Two engine capabilities exist because of it — reach for
them, don't re-invent:

- **`isTimed: true` + `timingState(state, ui)`.** The midend runs the clock while
  `timingState` is true and prefixes the status bar with `[M:SS]` (upstream
  `midend_rewrite_statusbar`, engine-owned — your `statusbarText` returns only the game
  text). Mines stops the clock before the first click, on death, on a win, and once
  `ui.completed` was ever set. **Browser-verify a timed game** — the rAF/worker timer path
  had never run before Mines; watch it tick, freeze, and resume.
- **`encodeUi(ui)` / `decodeUi(ui, s)`.** A `Ui` field set in `interpretMove` that lives
  *outside* the undo history cannot be rebuilt by replaying the move log (replay runs
  `executeMove`, never `interpretMove`) — Mines' death counter is the case: dying then
  undoing removes the death from the log. Serialise exactly those fields (upstream
  `encode_ui`/`decode_ui`); the midend writes them into the save's `ui` field and restores
  them after the replay. A game whose `Ui` is fully derivable from state omits both hooks.

### 3.12 A chord/press preview must not look like an opened cell (Mines)

Mines' pressed-preview (the mouse-down chord highlight) is drawn *identically* to an opened
cell — faithful to upstream `draw_tile`, but a trap: because a plain left-click on a number
*chords* here (upstream/this port both make left-click-on-a-number act), the press painted a
3×3 preview that, on a not-yet-satisfied number, flashed a false "uncover" reverting on
release — read by the owner as "uncovered blocks re-covered." Fix (Mines design D11):
**decouple the preview radius from the chord intent** — a left press keeps `validradius`
(so the release still chords / opens) but drops the preview (`hradius = 0`), matching MS
(a left-click shows no preview); the deliberate chord gesture (middle / Shift+left) keeps
it. General rule: if a transient press/preview overlay is visually indistinguishable from a
committed state, a press that *doesn't* commit reads as a glitch — make the preview distinct
or suppress it on the gesture that usually won't commit.

### 3.12a A line-fill drag: press picks the *transformation*, release commits it

Distinct again from Pattern's rectangle fill and Clusters' accreting paint
(§3.8e): Boats' drag fills **one row or column**, and the press decides not a
paint *value* but a `from → to` **pair** — "every square that currently reads
`from`, in the line I drag out, becomes `to`". Left-click cycles the pressed
square (empty→boat→water→empty) and the cycle's result is the `to`; right-click
toggles water. Four `Ui` fields carry it (`dragFrom`, `dragTo`, anchor, current),
and three rules make it behave:

- **The axis is chosen per drag event, not at the press**: whichever coordinate
  has moved *less* snaps back to the anchor (`abs(gx − dsx) < abs(gy − dsy)`),
  so a drag can change its mind about direction mid-gesture.
- **`from` is a filter, and `'*'` means "whatever is there"**. Clearing to water
  with the left button widens `from` to `'*'` so one sweep flattens a mixed line;
  a `from`-filtered drag paints only the squares that match, which is what makes
  "turn all my guesses in this row into water" a single gesture.
- **A no-op is rejected at `interpretMove`, not by comparing states** (§1): the
  shared predicate that decides "would this fill change anything?" is the same
  one `executeMove` filters with, so they cannot drift.
- The far-edge click target is widened by one (`gx === w → w−1`) so the number
  row/column is a grab handle for its line — small, and worth keeping.

Because the drag continues off the *button class* (`isMouseDrag`/`isMouseRelease`,
§3.8e) rather than the exact press button, a touch long-press that arrives as
`RIGHT_BUTTON` (§3.8c) starts and finishes its own water drag correctly — the
right answer for a game that genuinely uses the secondary button, where folding
right onto left would be wrong. Exemplar:
[`boats/index.ts`](../../src/native/games/boats/index.ts).

### 3.13 A non-square board: bespoke geometry + an inverse coordinate map (Bricks)

Some upstream games store an odd-shaped board in a *padded rectangle* and shear it
on draw. Bricks is a hexagon: `params.w`/`h` are the user size, but the backing
array is `w = params.w + ⌈h/2⌉ − 1` wide with the two triangular corners masked to
a `F_BOUND` sentinel (`applyBounds`), and each row is drawn offset rightward by
`tilesize/2` per row (`tx += row * ts/2`). Three rules make this cheap and correct:

- **The mask + neighbour table are logic, not display — port them verbatim.** The
  bounds mask decides how many playable cells the desc encodes and the fixed
  six-step neighbour table (`{0,−1},{1,−1},{−1,0},{1,0},{−1,1},{0,1}`) drives the
  neighbour-count validity. A cell-count or neighbour bug there desyncs the codec
  and the solver, breaking the byte-match. Everything *visual* (the shear offset,
  the border bevels, the origin from `game_set_offsets`) is display — match the
  look, keep it clean (§3.3).
- **`interpretMove` must invert the *exact* draw transform, in the same order.**
  Undo the origin, floor to a row, *then* subtract that row's shear before flooring
  to a column: `gy = ⌊(y − oy)/ts⌋; gx = ⌊(x − ox − gy·ts/2)/ts⌋`. Share the offset
  helper between `render` and `index` (Bricks exports `offsets(h, ts)`) so pointer
  mapping and drawing can never drift. The tile size is forced even (`ts & ~1`) so
  `ts/2` is exact — do that in *both* `computeSize` and `setTileSize`.
- **Under `NARROW_BORDERS` (the web build) `BORDER = 0`** — check the game's
  `#ifdef`, don't assume the desktop `tilesize/2`; Bricks' `computeSize` adds the
  half-tile shear plus one edge pixel and nothing else.

An SVG dump (`toSvg(result.recording.ops, size)` from a `renderScenario`, §2.5)
rasterised with `rsvg-convert` is the fastest way to confirm the shear is right
before touching the browser — a wrong offset shows instantly as a staircase.
Exemplar: [`bricks/render.ts`](../../src/native/games/bricks/render.ts) +
[`bricks/index.ts`](../../src/native/games/bricks/index.ts).

**The rule generalises past geometry: any rule the input and the display *both*
need is one function, called by both.** Coordinates are only the obvious case.
Crossing's clue list is an input surface, so it shares `layoutNumbers` (where a
clue is) — but it also *colours* each clue by which run a click would send it to,
and that rule was written twice: `runForNumber` for the click, an inline loop in
`redraw` for the colour. They agreed until the rule got a tie-break, at which
point the list said "this goes down" while the click put it across (owner-reported
on Crossing). The fix is not to fix both copies but to delete one — `redraw` now
asks `runForNumber`, so the colour cannot name a run the click disagrees with.
**Tell:** a predicate in `redraw` that answers a question about *what a move would
do*. That belongs to the move code; render should be asking, not deciding.

### 3.14 Several grid *modes* on one substrate: a movement table, not N geometries (Ascent)

A game with multiple grid shapes (Ascent: Rectangle / no-diagonals / Hexagon /
Honeycomb / Edges) is often **not** five geometries — it is one square-grid
substrate plus a per-mode **movement table** `{dircount, dirs: Step[]}` (with
`dirs[n]` the inverse of `dirs[dircount−1−n]`, which the solver relies on to clear
a neighbour's reciprocal segment). Adjacency (`isNear`), the solver, the codec and
`checkCompletion` all read the movement table and are otherwise geometry-free;
hexagon/honeycomb are square grids with **wall padding** (`NUMBER_WALL` promoted to
`NUMBER_BOUND` at the border) and the half-tile visual offset is a *render* concern.
Result: the renderer has **no per-mode board code** — faces are never filled, edges
are straight `dot→dot` segments — so one `redraw` draws every mode and the physical
grid size (`ascentGridSize`: Honeycomb widens `w`, Edges rings a 2-cell border) is
the single frozen-into-IDs geometry input. Keep the **physical** `w`/`h` (state) and
**user-facing** `w`/`h` (params) explicit and separate, exactly as the C does.

Two more Ascent-surfaced patterns worth reaching for:

- **Multi-method number entry reduces to a small discriminated move + an ephemeral
  `Ui`.** Three entry gestures (click-a-number-then-adjacent, click-empty-then-type,
  Edges drag-from-arrow) plus free-form path drawing all emit one of
  `place`/`line`/`clear`/`solve` — the entry *state* (held cell, typing buffer, drag
  anchor, cursor, candidate hints) lives on the `Ui`, never the state. Port upstream's
  `interpret_move`→`mouse_click` split faithfully; the C `switch` **fallthroughs**
  (`LEFT_BUTTON`→`LEFT_DRAG`) become an extracted arm called from the end of the prior
  case (a real `switch` fallthrough trips `noFallthroughCasesInSwitch`).
- **A "path-resolution post-pass" that iterates.** When a drawn line can *force*
  placed numbers, `executeMove` runs `do { cleanPath; updatePositions } while
  (applyPath)` after the fragment, then the completion check — a fixpoint, not a
  single pass. Port the loop; it is subtle (a fully-drawn segment between two known
  numbers fills the cells between them). Exemplars:
  [`ascent/state.ts`](../../src/native/games/ascent/state.ts) (movement table +
  `isNear`/`ascentGridSize`), [`ascent/ui.ts`](../../src/native/games/ascent/ui.ts)
  (the entry methods), [`ascent/moves.ts`](../../src/native/games/ascent/moves.ts)
  (the post-pass), [`ascent/solver.ts`](../../src/native/games/ascent/solver.ts)
  (a solver-state flag that *persists across solves* on a reused scratch — a
  byte-match-critical quirk; see the change's design F1).

## 4. Differential check (per-game, optional)

**Dev-time differential spot-check** (advisory, *not* a gate): generate N boards
from the C build and the TS port for the same seed and eyeball the diff.

**Scope byte-parity to the generator/solver/codec — it buys nothing for display
(owner-stated doctrine, 2026-07-04).** Byte-fidelity earns its keep in exactly
two places: the **RNG-fed generation path** (same seed ⇒ same board, which is
what the differentials in this section verify and what keeps shared IDs
reproducible) and, tactically, as a **porting ease** — transcribing upstream's
solver/generator verbatim is often the lowest-risk way to get it right. It was
the project's founding "hard wall" but is no longer: with 26 ports proving the
TS direction, the bar for everything user-facing — rendering, layout, geometry,
animation, colours — is **neat visuals and clean code**, not pixel-for-pixel
reproduction of the C frontend. Port display code *faithfully enough to play
identically* (§6's behavioural parity gate still applies in full), but when the
C's drawing does something awkward and a cleaner TS shape looks as good or
better, prefer the cleaner shape — and deliberate visual *improvements* (the
Range known-white fill, the shared correct-region shade, mistake overlays) are
the point of the fork, not deviations to be minimised.

**And on the generator/solver/codec path itself, byte-parity is a *means*, not
an end (owner-stated, 2026-07-20).** It is the default there — but because it
*buys* two concrete things, not because fidelity is owed to upstream:

1. **It is the verification mechanism.** On a solver-gated generator the desc
   depends on the solver's verdict on every intermediate board, so a single
   byte-match assertion validates the generator, the solver and the codec at
   once. Nothing else available is nearly as strong, and the bigger the game the
   more that matters.
2. **It is porting ease.** Transcribing upstream's logic verbatim is the
   lowest-risk way to get a hard algorithm right.

**Both of those jobs are now finished, and the owner released the constraint
(2026-08-01):** *"it was only a temporary one for the porting, but now that we've
finished porting, I'm very happy to diverge in favour of a better play
experience, wherever it's worth it."* Every game is ported, so **matching the C
is no longer a reason not to improve a game**, and "it would change every board"
is a cost to weigh rather than an objection that ends the discussion.

Two things it does not change, and one technique it makes the default:

- **"Wherever it's worth it" is the whole test.** A divergence still needs a
  stated player-visible benefit. Tidiness is still not one.
- **Say what replaces the oracle.** The byte-match was the strongest assurance
  available; dropping it leaves a hole. The standard filling is a property test —
  every generated board uniquely solvable at *exactly* its stated difficulty —
  which is weaker but real. `replace-seismic-region-generator` and the Mathrax
  Recursive divergence both did this; copy them.
- **Try to keep both.** You often need not choose. **Spokes** ships a corrected
  difficulty-acceptance check *and* retains upstream's original one, reachable by
  the differential alone (`spokes` spec, "grades its difficulty tiers honestly"),
  so the frozen fixtures still byte-match against the old path while players get
  the better boards. Reach for that shape before retiring a differential.

Four rules for deciding, learned on `add-loopy-ts-port`:

- **Divergence is free where C has no defined behaviour.** Upstream aborts on a
  degenerate Penrose patch (`dsf_new(0)`). Retrying with a fresh description
  diverges *only* on the seeds where C crashes, so byte-agreement is preserved
  everywhere C produces any output at all. When you find a case like this, take
  it — there is nothing to match.
- **Price the quirk before paying or refusing.** "Bug-compatibility" sounds
  expensive and usually isn't. `face_setall_identical`'s never-reassigned return
  value costs *one line and a comment* — and preserving it is mandatory, because
  the generator is solver-gated so the resulting early exit is baked into which
  puzzles exist. `parity_deductions`' negative-modulo quirk costs *nothing at
  all*, because TS's `%` truncates exactly like C's; the "trap" is only "don't
  apply the hygiene fix". Don't narrate a sacrifice you aren't making.
- **Diverge for a genuine player-visible defect, not for tidiness.** A solver
  that deduces *falsely* can generate a puzzle with no unique solution — that is
  worth fixing and recording, even at the cost of the differential. A solver
  that is merely *weaker* than intended was **not**, until 2026-08-01.

  **Amended 2026-08-01.** The rule used to continue: *"a solver that is merely
  weaker than intended is not a defect; it is the difficulty curve upstream
  shipped, and fixing it changes every board."* That clause was doing two jobs
  and only one survives. *Tidiness is still not a reason* — do not strengthen a
  solver because you can. But **"it changes every board" is no longer an
  objection**, so a weaker-than-intended solver *is* fair game where the stronger
  one makes the game better to play. The clearest case is a difficulty tier that
  does not mean what it says: Bricks' own documentation admits "selecting Tricky
  difficulty may generate a puzzle at Normal difficulty instead", which is a
  player-visible defect that this clause used to protect.
- **Diverge where the C shape doesn't fit a browser.** `grid_trim_vigorously`'s
  dense `O(numDots²)` matrix is ~576 MB at 50×50. Structure is not behaviour:
  the replacement is exact, so this costs no fidelity at all — the trap would
  have been transcribing it faithfully *because* it was the C's shape.

**A `validate_params` that does real work is load-bearing — port it before you
port anything that depends on it.** Upstream param validation is usually a few
bound checks, so it is tempting to leave for last. Boats' last check *places the
entire fleet* with the RNG-free first-fit, and it is the **only** thing standing
between the player and an infinite loop: `new_game_desc` retries fleet placement
unboundedly, so an unfittable fleet (the default 3,2,1 in 5×4 — measured) spins
for ever. This is not a Seismic-style cost problem (everything generable is fast)
and no retry budget is the right answer; the *feasibility* check is. The tell is
a `validate_params` that allocates, calls a generator helper, or builds a board.
Grep for one before writing the trace-harness fixture list — a hang there is how
this one was found, ten minutes into a run that should have taken a second.

**Measure a "rare failure" before you design the recovery for it.** A generator
that fails on some inputs invites the reflex "retry, it's just an unlucky seed".
Check. On `add-loopy-ts-port` the design assumed every degenerate Penrose patch
was seed-dependent; 200 draws per configuration across all four aperiodic
tilings showed that was true for all but one — Penrose kite/dart at **width 3**
never succeeds, at any height, while 4×3 and larger heights-of-3 succeed about
half the time. The two failure modes need opposite fixes and it is cheap to tell
them apart:

- *Unlucky* ⇒ **retry**, bounded, driven by the same RNG stream so determinism
  and shared game IDs survive.
- *Impossible* ⇒ **reject in `validateParams`**, where the Custom dialog can
  show a reason, rather than letting the player press "New game" and wait for an
  error. And reject the precise thing you measured: a width bound, not an
  `amin` bump that would also forbid the sizes that work.

Corollary on bounds: size the retry budget from the *worst measured success
rate* of a generable configuration (Loopy's was ~20%, so 100 attempts fail at
~2e-10), not from the house default. A generous bound is correct for a runaway
guard but turns an impossible configuration into a ten-second hang before the
error.

**And one game can be *both* failure modes, split by a parameter — measure the
boundary and apply both fixes.** Seismic's region grower merges blindly and then
demands every region hold exactly `1..k`, so its success rate collapses with
board size: 1/22 at 16 cells, 1/4,167 at 36, 1/200,000 at 49, and **zero** in
200,000 attempts at 56 and above. Neither fix alone is right — a size cap at 36
would forbid the shipped 7×7 presets, and retry-only leaves a 10×10 Custom board
spinning for minutes before a `RetryLimitExceeded`. So it takes both: a
`MAX_CELLS` bound in `validateParams` for the range that provably cannot
generate, and a retry budget sized from the *measured* worst legitimate case
(1,184,978 attempts) for the range that can. The bound then also frees the retry
budget to be generous, since nothing hopeless reaches it. Sweep a grid of shapes
rather than a single dimension — the ceiling tracked cell count, not width or
height, which neither a `w` bound nor an `h` bound would have expressed. Exemplar:
[`seismic/state.ts`](../../src/native/games/seismic/state.ts) (`MAX_CELLS`, with
the measurement table in its doc comment) +
[`seismic/generator.ts`](../../src/native/games/seismic/generator.ts).

**Check what a shared runner's bookkeeping actually decides before adopting
it.** Two handoffs asserted Loopy's four deduction rungs "fit
`runDeductionFixpoint`". They don't: the shared runner restarts from rung 0 on
any firing and grades by "highest rung that fired", where Loopy runs under a
difficulty *cap* and carries a `(thresholdDiff, thresholdIndex)` pair that skips
cheap rungs which provably cannot use the latest information. That began as a
speed optimisation — but on a **solver-gated generator, the order the solver
explores in decides which puzzles exist**, so adopting the shared loop would
have silently changed every board. Reuse the shared runner when the loop is
genuinely an ordered ladder; port the loop exactly when its bookkeeping feeds
back into generation.

Whenever you do diverge, say so in the code and in the change's `design.md`, and
note what verification you gave up in exchange.

**A differential earns its place on solver/codec games, not every port.** It pays
off where the generator runs a hard uniqueness/difficulty loop or a non-obvious
codec (galaxies, unruly, flood, guess); permutation / short-RNG games (cube, fifteen,
sixteen, twiddle, pegs, blackbox) get their RNG-faithfulness transitively from
`random.ts`'s own corpus plus the existing differentials, and deliberately ship
without one (**state the skip in the port's `design.md`**, as those did). Of the
games to date, only some carry a committed gated test — by this per-game decision,
*not* because a differential is mandatory. (No advisory `scripts/diff-*.test.ts` are
currently committed — an advisory script is dev-time-only and is deleted with the
game's `.c`, §4.1 — so finding none on a `grep` is expected, not a gap.)

### 4.1 The two lifecycles — get them right or leave a no-signal vestige

- **Gated, committed, durable:** the frozen-snapshot test
  `src/native/games/<game>/<game>-differential.test.ts` vs a `__fixtures__/*.json`
  recorded from C. This is the form that *survives* the port. When its shape is the
  **byte-for-byte desc match** (a faithful generator over the bit-identical RNG —
  samegame/unruly/flood/guess), don't re-roll the `describe`/`for`/`it`/`expect`
  loop: call
  [`describeDescDifferential`](../../src/native/engine/testing/differential.ts) with
  your fixtures, a `params` mapper, your `newDesc`, an optional `label`, and an
  optional `extra` for a follow-on check (e.g. `validateDesc`). Solver-agreement
  (decode a C board, run the TS solver, assert the recorded difficulty — galaxies;
  unruly's 2nd assertion) is game-specific and stays **inline**.
- **Advisory, dev-time-only, deleted with the C:** a live `scripts/diff-<game>.test.ts`
  earns its keep *only* while it shells the live C trace binary
  (`build/native/auxiliary/<game>-trace`) for a true C-vs-TS compare. That binary is
  built from `puzzles/<game>.c` + `puzzles/auxiliary/<game>-trace.c`, **both deleted
  at port acceptance** (the per-game C-deletion doctrine). So the moment the port
  ships, the advisory script can never run live again — only skip (no binary) or
  re-read the frozen fixture the gated test already reads (no signal). **Delete
  `scripts/diff-<game>.test.ts` in the same commit that deletes the game's `.c`** —
  don't leave a vestige (flip/galaxies/unruly each left one; all three removed in
  `improve-port-tooling`). The infrastructure stays for the *next* in-flight port:
  one `scripts/diff.vitest.config.mts` + `npm run diff` (`--passWithNoTests`, so it
  no-ops when no advisory script exists). Recover a deleted script from git history if
  you rebuild the C oracle.

Exemplar end-to-end (while the C still exists):
[`unruly-trace.c`](../../puzzles/auxiliary/unruly-trace.c) →
[`unruly-differential.test.ts`](../../src/native/games/unruly/unruly-differential.test.ts).

### 4.2 The C trace harness + the build-pure-C gotcha

The C trace harness lives in `puzzles/auxiliary/<game>-trace.c`, `#include`s
`../<game>.c` to reach its `static` generator/solver (the `STANDALONE_SOLVER`
trick), and prints the desc (+ recorded solver difficulty) as JSON; add one
`cliprogram(<game>-trace <game>-trace.c)` line to
[`puzzles/auxiliary/CMakeLists.txt`](../../puzzles/auxiliary/CMakeLists.txt).

**Gotcha — build the harness pure-C.** `scripts/build-native.sh` configures with the
umbrella `USE_TS_LEAVES`/`USE_TS_RANDOM` default **ON**, which swaps `random.c` out
for a SHA-only `sha.c`; any generator trace then fails to link
(`random_upto`/`random_new` undefined). Reconfigure pure-C first (the cmake cache
persists, so pass the flag explicitly):

```
cmake -B build/native -S puzzles -DUSE_TS_RANDOM=0
(cd build/native && make <game>-trace)
build/native/auxiliary/<game>-trace > src/native/games/<game>/__fixtures__/<game>-c-reference.json
```

**Record the C's own wall-clock per fixture while you are there.** One
`clock_gettime` pair around `new_game_desc` and a `"genMs"` field costs nothing
and converts "is the port slow?" from an impression into a fact you already have
on disk. It mattered on Seismic, whose 7×7 presets take tens of seconds: the
fixtures show the C at 42.9 s where the TS port takes 27.8 s on the same seed, so
the cost is upstream's algorithm rather than anything the port introduced — which
is the difference between a parity shortfall and a note in `design.md`. Don't
*assert* on it (a wall-clock assertion measures the box, not the code — §5.2);
just carry it.

### 4.3 Byte-match: the strongest bar *where there is a right answer*

Because `random.ts` is bit-identical to `random.c`, a *faithful* generator port
reproduces the C desc **exactly** for the same seed — assert
`newDesc(p, randomNew(seed)).desc === fixture.desc` (Unruly does this across every
difficulty + unique mode; the Flip CROSSES path is the precedent). Fall back to the
weaker "TS solver agrees at the C-recorded difficulty" bar (Galaxies' D7) only when
the generator legitimately diverges (e.g. extra RNG draws). Either way it's advisory
— tighten per-game, never gate CI on C.

**A generator loop that *rejects* a candidate has already spent its RNG draws —
reproduce the rejection, not a cleaned-up version.** The tempting refactor of a
"draw, decide it's no good, `continue` without incrementing the counter" loop is to
pick only from the legal candidates in the first place. That changes the draw
sequence and silently diverges the desc. Netslide's shuffle draws a direction and a
row/column, *then* declines a slide that would undo the previous one (or repeat it
so often it becomes a shorter slide the other way) and retries **without** rewinding
the RNG — so the rejected draws are part of the stream and the port must make them
too. The tell is a C `for (i = 0; i < n; /* incremented conditionally */)`: the
missing `i++` in the header is the author flagging exactly this. Same family as the
§4.4 quirks — when the C does something that looks like it could be tidied, first ask
whether the tidying is observable in the RNG stream.

**A deterministic *solver* can be byte-matched too — but as a scaffold, not a
destination.** The differential's usual subject is the desc, because that's what the
RNG feeds. But a solver that draws no randomness is a pure function of the board, so
if its output is a comparable artefact (Inertia's `solve_game` returns the actual
route it makes the player follow, as a direction string), the trace harness can record
that too and the port can be asserted to reproduce it **exactly**. Do it: it costs one
extra field in the trace harness, and it is a far stronger check while you are porting
than "the answer it found is *a* valid one". Inertia's ~250-line approximate-TSP tour
(graph construction, node/edge ordering, four BFSes per gem, the insertion heuristic,
the two-direction reduction pass) was pinned end-to-end by ten recorded routes, and the
one bug in it (the `memmove` trap, §3.1) surfaced as a route mismatch on the first run.
It works precisely because it forces you to reproduce C's *iteration orders*, not just
its logic — which is exactly where a faithful-looking port silently drifts.

**Then ask whether the artefact has a right answer, and if it doesn't, give the
byte-match up.** A solver that finds *the* solution to a logic puzzle does; an
approximate optimiser does not — a tour is only better or worse, and there are many
equally good ones. Keeping the byte-match on one welds the port to C's shape forever:
Inertia's tour could not be written idiomatically (the `memmove` splice *is* the
algorithm, bit for bit) and, worse, could never be **improved**, because any
improvement is a diff. Once it was dropped (owner, 2026-07-13), the tour was rewritten
around real path objects and grown *twice* — nearest-gem-first and farthest-gem-first,
keeping the shorter — which beats C's route on six of the ten fixture boards and ties
on the rest. The differential then asserts what actually matters: the route is legal,
it collects every gem, and it is **no longer than C's**. That last clause is the trick
— keep the recorded C artefact as a *quality yardstick* rather than an answer key, and
you get a regression bar that a byte-match could never give you, since a byte-match is
equally satisfied by faithfully reproducing a *bad* answer. This is the byte-parity
scope doctrine (§4 intro) applied one level in: fidelity where there is a fact of the
matter, "write it well" where there isn't. Exemplar:
[`inertia-trace.c`](../../puzzles/auxiliary/inertia-trace.c) →
[`inertia-differential.test.ts`](../../src/native/games/inertia/inertia-differential.test.ts).

**An encoder that never flushes its trailing run is a *format*, not a bug —
don't "complete" it.** Boats' run-length grid encoder emits a run only when it
meets a clue or hits its 26-square cap, so a board whose final squares carry no
clue simply encodes short, and a board with no clues at all encodes as its
border numbers alone (`"0,3,0,1,1,0,2,1,"` — the desc just stops). Its
`validate_desc` agrees: it rejects *too many* grid squares and says nothing
about too few. Flushing the tail "for symmetry" would diverge every desc whose
last cell is clue-less, which is most of them. Same family as the writer/reader
disagreement below: read what the **reader** accepts before deciding what the
writer owes it — and mirror that asymmetry in the port's `validateDesc` and in
the spec (this port's spec delta had to be corrected, having asked for a
too-few-squares rejection the C does not make).

**A codec's writer and reader can disagree — check the round-trip before
assuming the encoder defines the format.** Upstream codecs are usually exact
inverses, so the reflex is to transcribe the writer and trust it. Seismic's wall
run-length encoder writes a gap run of `n` as a bare `'a' + n - 1`, which at
`n = 26` produces `'z'` — a character its *own reader* takes to mean something
different ("26 gaps and no wall", dropping a wall) — and past 26 leaves the
alphabet entirely, so the reader rejects it. That range has no defined behaviour
(§4 rule 1), so diverging there is free: chunk into the unit the reader already
understands, and stay character-for-character identical everywhere the two agree.
The check that makes this safe is to write the test's decoder **strictly to the
C's reading rules** and round-trip random patterns through it, so the encoder is
validated against upstream's grammar rather than against itself — encoder-vs-own-
decoder would have passed happily. Exemplar:
[`seismic/state.ts`](../../src/native/games/seismic/state.ts) (`encodeWalls`).

**A `qsort`/`.sort()` that feeds only *rendering* does not threaten byte-match.**
Only sorts (and RNG draws) on the path that produces the desc matter. Signpost's
`update_numbers` `qsort(compare_heads)` orders regions purely to assign display
colours — it never touches the desc byte-stream — so it's free to port as a plain
`.sort()` (the comparator is a total order anyway). Don't let a scary-looking sort
in the `.c` talk you out of a byte-match; trace whether its result reaches the
desc. (Contrast Undead §4.8, where the generator's `qsort` of equal-length paths
*does* feed the desc and forces the order-independent-verdict fallback.)

### 4.4 Solver-gated generators: match C's *verdict*, not merely be correct

When the generator removes clues by re-running the solver and keeping a removal only
while it still solves (Filling's `minimize_clue_set`, any Nikoli-style minimiser),
the published clue set — and so the desc — is decided entirely by the solver's
*solved/stuck* verdict on each intermediate board. A byte-match differential then
demands the TS solver reach the **identical verdict to C on every board**, which is
stricter than "a correct solver": it must replicate C's *exact deductive power*,
including upstream quirks. Two traps, one debug cycle each on Filling, will recur:

- **Faithfully reproduce upstream solver quirks, even buggy-looking ones.** Filling's
  `learn_critical_square` walks a region's `connected` list from its canonical cell
  `i` and its `if (i == k) continue` skips a square that only `i` (not another
  member) can reach — a real upstream quirk. Port it verbatim; "fixing" it makes the
  TS solver *stronger* and removes clues C keeps.
- **The quirk can be an outright *generator* bug that silently disables a whole code
  path — reproduce it anyway.** Solo's `merge_some_cages` (the killer cage grower)
  writes each candidate pair to `pairs[npairs]` but **never executes `npairs++`**, so
  `npairs` stays 0, its random pick-and-merge loop never runs, and it *always returns
  false drawing no RNG* — meaning **no killer cages are ever merged** and every killer
  puzzle ships the raw `gen_killer_cages` layout (the elaborate grade-and-merge loop
  in `new_game_desc` is dead). The first cut "fixed" the missing increment and the
  killer desc diverged on the very first board. Port the missing increment (and so the
  always-false, zero-RNG behaviour) verbatim, with a loud comment, and keep the dead
  pick loop 1:1 with C so the correspondence is auditable. Lesson: when a byte-match
  diverges on one variant only, suspect that a generator helper is doing *more* (or
  less) than its name implies — diff it against C line-by-line before trusting the
  name. Exemplar: [`solo/generator.ts`](../../src/native/games/solo/generator.ts)
  `mergeSomeCages`.
- **A generator that tests its solver's verdict for bare *truthiness* may be
  silently shipping non-unique puzzles — check what the verdict enum contains.**
  Mathrax's two clue-stripping loops keep a removal on `if (mathrax_solve(...))`,
  but that function returns `-1/0/1/2` and **`2` means *ambiguous***, which is
  truthy. Below its top tier no recursion runs, so the verdict is only ever `0`
  or `1` and nothing is wrong — but at `Recursive` the generator strips straight
  past uniqueness: 30 of 30 sampled boards had several solutions and the C
  fixtures came out as *completely blank grids*. That is a genuine player-visible
  defect (§4 rule 3), not a difficulty curve: `findMistakes` correctly refuses to
  judge a board with no unique answer, so Check & Save silently degrades across
  the whole tier. Fixing it is two comparisons, and is *provably inert* on the
  tiers whose verdict set excludes the ambiguous code — so the byte-match survives
  everywhere except the broken tier, which keeps the weaker §4.8 verdict check
  instead. **Grep a solver-gated generator for `if (solve(` and `if (!solve(`
  before trusting it**, and when you find one, measure the tier before deciding.
- **The byte-match is also what lets you *attribute* a bug like that.** Before the
  fix, the TS generator reproduced C's ambiguous descriptions byte-for-byte — so
  C's own solver returned "ambiguous" on the same intermediate boards and C
  accepted the removal anyway. Without the differential, "is the tier broken or is
  my solver too weak?" would have been an open question; with it, the answer is
  immediate and certain. This is §4's "byte-parity is the verification mechanism"
  paying off in a way that has nothing to do with fidelity.
- **A generator's own acceptance gate may be running on a *dirty* scratch
  board — reproduce the lifecycle, not the intent the comment states.**
  Spokes' `spokes_generate` ends with "…and it must **not** solve one tier
  easier", which reads like a difficulty guarantee. It isn't: the re-solve runs
  on the scratch board with only its clue numbers refreshed, so the solver
  starts from whatever position the *last candidate's* solve left behind —
  often a finished solution, which validates instantly and fails the attempt
  for no difficulty-related reason. Measured: the gate saw an already-complete
  board in 31–45% of attempts, and 10 of 12 4×4 "Hard" boards also solve at
  Tricky. General tell: when a generator hands its solver a *reused* board, ask
  what state that board is in on entry — the answer is part of the algorithm.
  Exemplar: [`spokes/generator.ts`](../../src/native/games/spokes/generator.ts)
  (`spokesGenerate`).

  **How it was resolved, and the reusable move — keep the oracle *and* ship the
  fix.** The first call was rule 3 ("a weak difficulty curve is the curve
  upstream shipped, not a defect"), reproduce the lifecycle. The owner overruled
  it — *upstream being clearly wrong is a reason to fix it* — and the
  re-measurement showed the trade had been mis-costed anyway: clearing the board
  takes 4×4/6×6 Hard from 10/12 and 5/12 over-graded to **0/12**, and generation
  gets *faster* (6×6 Tricky 538 ms → 177 ms median), because most of the dirty
  gate's rejections were spurious. The way to keep both: give the generator an
  **`upstreamDirtyGate` option that restores upstream's exact behaviour and is
  set by the differential alone**. The game ships the corrected algorithm; the
  25 fixtures still match the C byte-for-byte; the only code outside the
  oracle's reach is the four-line divergence itself, which gets a behavioural
  test instead. Pair it with a test asserting the flag still *changes* the
  outcome, or the oracle can silently decay into testing the shipped path.
  Reach for this whenever a deliberate divergence sits on an otherwise
  byte-matched path — it is much cheaper than either horn of "keep the bug" vs
  "lose the differential".

  **Now used twice, so treat it as the default technique, not a Spokes trick.**
  `replace-seismic-region-generator` applied the identical shape at a much larger
  scale: Seismic's whole *region generator* was replaced (upstream's fill-then-merge
  succeeded roughly once in 200,000 attempts at 7×7, taking 25 s, and never at all
  above ~50 cells), yet all 28 fixtures still byte-match because upstream's two
  stages survive behind `upstreamRegionGrower`, which only the differential sets.
  Note how much oracle that preserves: the replaced stages are *upstream* of the
  clue-stripping and grading loops, so the solver's verdict on every intermediate
  board, the codec and the difficulty gate all keep their byte-exact check while
  the stage that was actually rewritten moves to property tests. Two rules that
  transfer:
  - **Comment the retained code at every definition as deliberately-unreachable
    oracle**, or a later reader deletes the "dead" branch and silently deletes the
    differential with it.
  - **The retained path may need its own constants.** Seismic's runaway guard had
    to split into `MAX_ATTEMPTS` (10,000, the shipped path) and
    `MAX_ATTEMPTS_UPSTREAM` (5,000,000, because upstream's grower legitimately
    needs ~1.2M attempts). One shared bound would either strangle the oracle or
    make a real divergence hang.

  Exemplar: [`seismic/generator.ts`](../../src/native/games/seismic/generator.ts)
  (`SeismicGenerateOptions.upstreamRegionGrower`).
- **Bound a generator by its TAIL, not its median — one seed per size is not a
  measurement.** Seismic's new bound was first set from single-seed timings per
  configuration, which said 10×10 Tectonic cost 22 ms–4.7 s; it shipped as a
  preset. Repeating the slow sizes over nine seeds each showed medians of
  4.9–6.2 s hiding a **worst case of 18.3 s**, and the same at 80–81 cells
  (medians ~1.5 s, tails 16–17 s). The preset was withdrawn and the bound dropped
  from 100 cells to 64 — the largest size whose *worst* run stays near two
  seconds. Note the trap precisely: an exhaustive sweep of all 392 accepted
  configurations had **zero failures**, so every size was genuinely reachable.
  Reachability answers "does this work?"; only the tail answers "should we offer
  this?", and a bound exists to settle the second question. Whenever a generator
  bound is being set or raised, repeat the sizes near it across several seeds
  before believing the number.
  - **Optimise first, then bound — a bound set on unoptimised code can exclude a
    shipped preset.** Slide's tail at its largest upstream preset (8×6) measured
    **22.8 s** before the visited-set fix in §2.1 and **1.8 s** after, so a bound
    drawn from the first number would have forbidden a board upstream ships. Do the
    cheap profiling pass before fixing the constant.
  - **And check whether the wall is time or *memory*.** Slide's cost curve doesn't
    end in a slow generation: at 54 cells the BFS exhausts a 4 GB heap after four
    minutes. That is the difference between a retry budget (which assumes failure is
    recoverable) and a hard `validateParams` bound — in the worker an OOM is a crash,
    not an error message the Custom dialog can show. Measure at least one size past
    where you intend to draw the line, and note which way it fails.
- **When you replace a generator, the thing you must *not* guess is the shape of
  what it produced — and you may be able to recover it from the frozen fixtures.**
  Seismic's region-size distribution is emergent in the C (it falls out of random
  merging), so it is unreadable from the source and looks like a pure taste call.
  But it is recoverable: decode the frozen C descriptions and histogram the result
  (upstream: mean region 2.62, never above 6 despite numbers running to 9). That
  turns "invent a distribution" into "match a measured one, and deviate
  deliberately". Whenever a rewrite has a free parameter that the *old* output
  implicitly fixed, check whether the fixtures already answer it.
- **Reusing the solver's propagator is necessary but often not sufficient — reuse
  its *pruning* test too.** Seismic's new fill was designed around `placeNumber`
  (place `n`, strike it from the keep-apart cells and the rest of the region).
  That is only forward-checking, and under a distance-scaled rule a placement can
  starve a *distant* region of its last home for some number without touching any
  cell the placement itself looks at — so the search finds out many levels too
  late and thrashes. Adding `solverAttempt`'s "can every region still house every
  number it owes?" check as the pruning rule cut one configuration from 2,731 ms
  to 211 ms. If a constructive generator built on a solver's propagation is
  backtracking far more than ~1 node per cell, the missing piece is usually a
  global feasibility test the solver already implements.
- **An early-out that exists only under a diagnostics define is NOT release
  semantics — port the release build.** Slant's `fill_square` has "already
  filled with the opposite value" and "would make a loop" checks whose
  `return false` sits *inside* `#ifdef SOLVER_DIAGNOSTICS`, which neither the
  shipped build nor a trace harness defines — so in the build being
  byte-matched, `fill_square` never fails and will overwrite. Porting the
  guarded semantics ("obviously what was meant") changes solver verdicts and
  diverges the desc. When a C early-out looks load-bearing, check which
  `#ifdef` it lives under before porting it. Exemplar:
  [`slant/solver.ts`](../../src/native/games/slant/solver.ts) `fillSquare`.
- **A solver may not be *monotone in its difficulty cap* — check before wiring
  Solve and `findMistakes` to the maximum.** The reflex (every port to date) is
  `solve(board, MAX_DIFF)`: more techniques can only help. Boats disproves it.
  Its unfinished-boat dsf check runs only from Normal upward and counts a
  partial run of length `k` as a *finished* size-`k` boat, so when every
  size-`k` boat is placed it reports a contradiction the board doesn't have —
  and because the validator's INVALID breaks the solve loop, the solver
  **stops**. Measured: **13–17 of 20 Easy boards** are stuck at the maximum cap
  while solving fine at Easy; Normal and above are untouched, because only an
  Easy board is never gated against those techniques. The C does exactly the
  same (confirm with a throwaway `<game>-dbg.c` that solves one desc at each
  cap — one file, ten minutes, and it converts "my port is broken" into "this
  is upstream" with certainty).
  - **The consequence is severe and silent**: `findMistakes` re-solves, gets
    stuck, returns `[]` — so `canFindMistakes` stays true while Check & Save
    checks nothing and stores a wrong board. That is the §3.5 failure the hook
    exists to prevent, reached by a completely different route than Mathrax's.
  - **Fix at the call site, not in the solver.** A false *abort* only makes the
    solver weaker, never wrong, and a solver-gated generator re-verifies every
    board with the same solver — so the boards that exist are all correct
    (rule 3). Repairing the check would change every intermediate verdict, hence
    every desc, hence the byte-match oracle, to fix something generation never
    got wrong. Ask each cap in ascending order and take the first that solves
    (`solveAtAnyTier` in [`boats/solver.ts`](../../src/native/games/boats/solver.ts)):
    four solves on a once-per-click path, solver left byte-exact.
  - **The tell**, worth one cheap check on any tiered solver: generate boards at
    the *lowest* tier and solve them at the *highest*. If that ever fails, you
    have this bug — and a port that only ever tests "solves at its own
    difficulty" will never see it. (Boats' differential was 34/34 green
    throughout.)
- **Some deductions branch on the canonical-DSF-root *identity*, so the shared
  [`Dsf`](../../src/native/engine/dsf.ts) must match `dsf.c`'s root choice** (tie →
  the *second* `merge` arg; the larger class otherwise). The shared `Dsf` was aligned
  to `dsf.c` for exactly this (Filling's i-quirk picks a different square to skip if
  the root differs). A game that only uses the dsf for connectivity won't notice; one
  that reads `canonify(i)` as an *element* does.
- **A transient bit the C *mutates into the grid* can leak into a generator
  comparison — reproduce the leak.** Clusters' `clusters_validate` writes an
  `F_ERROR` bit onto every filled cell (set on a violation, cleared otherwise), and
  the generator never masks it: it survives the per-cell two-colour fill (only
  *cleared* cells are re-randomised), the isolated-cell flip (`^= COLMASK` leaves
  bit 3 untouched) and the reduce-to-dots (`|= F_SINGLE`), so it reaches the
  dot-prune's *full-byte* `grid[i] == grid[i-1]` compare — two adjacent equal dots
  whose `F_ERROR` bits differ escape pruning. The idiomatic clean port makes
  `validate` non-mutating, which prunes them and diverges the desc **only after ~100
  retries on one board in twelve** (the fixed-point + `force`-every-100 path amplifies
  a one-cell difference into a different final board). The fix is the §4.4 rule
  literally: keep a *mutating* validate on the generator/solver path that writes
  `F_ERROR` exactly as C, and separate *pure* checks (`clustersStatus`/`findErrors`)
  for play so persisted state and the renderer stay clean. General tell: any C
  `validate`/`check` that both returns a verdict **and** writes a flag byte back into
  the board is a byte-match hazard the moment a later full-byte comparison
  (`==`/`memcmp`/encode) reads that byte — grep the generator for reads of the whole
  cell, not just its masked fields. Exemplar:
  [`clusters/solver.ts`](../../src/native/games/clusters/solver.ts) (the `F_ERROR`
  contamination note). **Debugging method that found it in ~4 iterations** (§4.7 in
  miniature): a throwaway C harness dumping each generation attempt's grid localised
  the divergence to one attempt (100 matched, then one differed); a solver-only
  harness proved the two *solvers* agreed on that board, moving the fault to the
  pre-solve steps; a dot-set diff showed two extra dots at one corner; a full-byte
  dump exposed the stray `F_ERROR`.

### 4.5 A generator on a shared RNG-bearing leaf library is still byte-match portable

Port the library RNG-faithfully too. Singles' generator builds a Latin rectangle via
`latin_generate` → `matching_with_scratch` (bipartite matching). Byte-match holds
*only* if every RNG draw in that library is reproduced in order. The two draw sites
in `matching.c`: `shuffle(Lorder)` once per BFS pass, and the in-place `random_upto`
swap that permutes the *remaining* adjacency list during the DFS — and that swap
**mutates the adjacency lists in place**, so later draws see the permuted list;
mirror the mutation, don't copy-then-shuffle. Write the algorithm idiomatically
(typed arrays, no `void *scratch`) but keep the draw sequence identical. Exemplar:
[`singles/generator.ts`](../../src/native/games/singles/generator.ts) (`matching` +
`latinGenerate`). No standalone bridged seam — an ordinary module dependency, ported
lazily like dsf/tree234.

### 4.6 Replicate a missing-reset upstream quirk verbatim — but cap the loop

Singles' `new_game_desc` never resets `state->impossible` at its `generate:` label,
which would infinite-loop *if* generation ever set it — it doesn't, because
`solve_allblackbutone` circles a white cell's last escape at "3 blacks, 1 free"
*before* it can be boxed in. Port the no-reset faithfully (resetting it would
diverge), but wrap the outer regenerate loop in a generous `throw`-on-exceeded cap
(Singles: `MAX_REGENERATE = 10000`) so a faithful port stays correct while an
accidental divergence fails loudly instead of hanging.

### 4.7 The differential-debugging loop for a verdict mismatch

How the §4.4 traps were found: instrument a throwaway C harness
(`puzzles/auxiliary/<game>-dbg.c`, deleted after) to dump every `(board, verdict)`
its solver sees during minimise; replay each board through the TS solver and
binary-search the first verdict mismatch; on that board, toggle techniques off one
at a time to isolate which is over/under-powered, then diff that technique against
the C line-by-line. Two adjacent gotchas:

- **A sentinel imported from the wrong module reads as `undefined`** and silently
  weakens a `diff >= X` gate. Singles' `DIFF_ANY` lives in `state.ts`; a test that
  imported it from `solver.ts` (which doesn't re-export it) got `undefined`, and
  `solveSpecific(s, undefined)` ran only the Easy techniques — so a Tricky board
  "failed to solve" with no type error. When a difficulty sentinel test misbehaves,
  check the import source before the solver.
- **Watch C `for (init; cond; incr)` loops whose `incr` has a side effect.**
  Filling's `merge_ones`: `for (j…; ++j, board[i]=1)` resets `board[i]` after the
  *last* fall-through too, not only between iterations — a TS `for` won't run it after
  the final body, so replicate it explicitly.

### 4.8 When byte-match is *infeasible*: record order-independent solver verdicts

Byte-match (§4.3) needs a generator that is deterministic *given the seed* all the
way to the desc. A generator that sorts with **`qsort`** breaks that: `qsort` is
not stable and its tie-ordering is implementation-defined, so it differs between
glibc (the native trace harness), musl (the wasm build), and a TS `Array.sort`.
If the sorted order feeds the desc (Undead sorts equal-length sightlines, then
seeds unique-solution paths in that order, and the seeded monsters become the
clue numbers), the desc is **not reproducible byte-for-byte** — not even between
the native-glibc trace and the shipped wasm. Don't chase it; a TS stable sort is
all a TS-only game needs (its shared IDs are generated and replayed by TS).

The differential then validates the **solver + codec** instead of the generator:
the trace harness decodes each C-generated board and records only verdicts that
are **provably independent of the sort order** — for Undead, *uniquely solvable*,
*iterative-solver-solved-or-not*, *post-fixpoint ambiguity count*, and the
*brute-force outcome* (the iterative fixpoint is the intersection of monotone
per-path constraints, so it and everything reading it are order-invariant; an
*order-dependent* quantity like "passes to fixpoint" is deliberately **not**
recorded). The TS test decodes the same descs and asserts its solver reaches the
identical verdicts. State the byte-match infeasibility (and why) in the port's
`design.md`. Exemplar: [`undead-trace.c`](../../puzzles/auxiliary/undead-trace.c)
→ [`undead-differential.test.ts`](../../src/native/games/undead/undead-differential.test.ts),
design D1.

> Aside (Undead, parity not differential): upstream may compute state it never
> *renders* — Undead fills `cell_errors` on every move but no draw call reads
> them (only the count blocks and edge clues turn red). Parity means matching what
> the C *draws*, so don't invent a red-cell overlay the C never shows; keep the
> computed-but-unrendered field only if a later feature (a hint) will use it.

---

## 5. Tests

**Behavioural tests by tier** — reach for the lowest that fits; Playwright is
visual/integration smoke only. Tiers are codified in
[`repo-layout`](../../openspec/specs/repo-layout/spec.md):

- **Tier 1** — pure logic (`Game` impl, solver, generator, codecs), `node` env.
- **Tier 2** — render ops against a recording `GameDrawing` double, `node`.
- **Tier 2.5** — render scenarios + snapshots via
  [`src/native/engine/testing/`](../../src/native/engine/testing/)
  (`renderScenario(...)` drives a real `Midend` to a target frame; assert targeted
  ops **plus** `toMatchSnapshot`). **New render code SHOULD ship one.**
- **Tier 3** — components + persistence (`happy-dom`, `fake-indexeddb`).

**A shared engine module needs a test *of its own*, even when the differentials
already protect it** (`audit-test-suite-strength`). Extracting logic from a game
into `src/native/engine/` moves the code but not its tests: the game's frozen
differential still catches a defect in it, so nothing goes red and the module
quietly ends up with no local assertions. That is adequate *protection* and poor
*feedback* — the failure arrives as a differing description string after a full
generate-and-compare run, instead of as a named rule in 100 ms, and it is
invisible to the "run just the files I touched" habit §5 otherwise encourages.
The audit measured this: `deduction-fixpoint.ts`'s central `grade` semantics
survived its own test file, `latin.test.ts` *and* four consumer games' complete
directories, dying only under the full suite; and `wires.ts` (413 lines, nine
importers) had no test file at all. **So: when you extract, write the extracted
module's tests in the same change**, stating the rules its doc comment claims
rather than pinning values. Exemplar:
[`wires.test.ts`](../../src/native/engine/wires.test.ts).

**Keep a test's cost proportional to what it catches** (`right-size-the-test-gate`).
The gate is paid on every commit, and five files were once 66% of it. Three
treatments, in order of how little they lose:
1. **Short-circuit a deterministic search.** A "scan seeds until a board shows
   technique X" loop finds the same pair every time — record it and start there.
   This loses *nothing* (see `FIRST_FOUND_AT` in
   [`boats-hint.test.ts`](../../src/native/games/boats/boats-hint.test.ts): 63 s →
   6.4 s), and a stale pin must fall back to the full scan, never fail.
2. **Turn a seed count down** with `seedBudget(gate, full)` — but only for a
   property whose violation would be *systematic*, and say how many assertions
   the reduced count still executes (Spokes: 8 seeds still make 375 rule-out
   assertions, against 2,998 at 60).
3. **Defer to `npm run test:slow`** (`slow: true` on `describeDescDifferential`,
   or `describeSlow`/`itSlow`) — only where the cost is board **size** rather
   than configuration. **Never defer the only fixture covering a configuration**,
   and state at the call site what still covers it. Run the slow tier once per
   refactoring round; a tier nobody runs is worse than a deleted test, because
   the file still reads as coverage.

**And check a new test actually discriminates, by breaking the code under it.**
This applies double to a test you just made *cheaper* — the failure mode that
optimisation causes is a test that still passes and no longer catches anything.
Writing the test is not the same as the test working: `wires.test.ts`'s
"needs the connection to exist from BOTH sides" passed with the both-sides check
*deleted*, because the case it chose was one an unrelated guard already caught.
Flip the line the test is for, confirm it goes red, put it back. It takes seconds
and it is the only thing that distinguishes an assertion from a decoration.

**A byte-match differential does NOT exercise the interactive completion path —
drive `executeMove` → completion in a unit test too.** The generator/solver
differential (§4) runs the solver, whose `check_completion` is called with
`mark=false` (verdict only). A game's *interactive* `check_completion(mark=true)`
(error marking, path/loop marking, flash labelling) is a different code path the
differential never touches — so a bug confined to it sails through a green 22/22
differential. Tracks shipped exactly that: `checkCompletion`'s connectivity
`Dsf` build dropped the `INGRID` guard upstream's `dsf_update_completion` has, so
the exit cell's outward edge did a `dsf.merge(i, offGridIndex)` — an out-of-bounds
typed-array read corrupted the union-find, and `canonify` **infinite-looped** in
the `mark=true`-only pathclass block. It surfaced only when a `solve()`→
`executeMove`→completed unit test hung. Always pair the differential with a
tier-1 test that runs a move (or `solve`) through `executeMove` to a completed
board — it covers the `mark=true` path and the flash walk the differential can't.

**On an animated game, `moves` lands you on animation frame *zero*, not the settled
frame** — the move armed an animation, so the previous state is still on screen and
anything the game draws only once the move has *landed* (Inertia's dead-player splat)
is simply absent from the capture. Pass **`settle: true`** to run the animation/flash
clock out before the capture (`renderScenario({ …, moves, settle: true })`). Asserting
both frames from the same `moves` is the cheap way to pin an animation's endpoints —
Inertia's "the ball is still a live green circle mid-slide, and a red splat once it
lands" — and costs one extra scenario call.

### 5.1 Render-op vocabulary — know which primitive records as which op

The shared `RecordingDrawing` records a *filled* `dr.drawRect(...)` as `op === "rect"`,
but `drawRectOutline(...)` — a *stroked* box, i.e. a hint ring, error outline, or
cursor frame — records as `op === "line"` segments. A test checking a ring/outline
colour must therefore match `o.op === "line"`, not `"rect"` (asserting Range's
`COL_HINT_BLACKREF` premise ring cost a debug cycle on exactly this). Likewise a
`drawCircle` records with `fill`/`outline` fields, **not** `colour` — matching
`o.op === "circle" && o.colour === …` type-errors and always misses (Light Up's
bulb assertions hit this). Prefer the
shared `RecordingDrawing` and learn its op vocabulary; ad-hoc per-test doubles may
name things differently (Unruly's local recorder labels `drawRect` ops `"drawRect"`),
a second reason to reach for the shared one.

**An op carries *both* forms of its colour: `op.colour` is the palette index the game
passed, `op.rgb` the resolved `"rgb(r, g, b)"` label.** So assert against the game's
own constant — `o.colour === COL_HINT` — and don't rebuild the rgb string from the
palette to compare (the resolved label exists so a *snapshot* diff stays readable when
a palette index moves, not so tests match on it). Narrowing note: `DrawOp` is a
discriminated union, so a *chained* `.filter(o => o.op === "rect").filter(o => o.w …)`
doesn't narrow and `o.w` type-errors — put the whole predicate in one `filter`, or give
it a type guard (`(o): o is Extract<DrawOp, { op: "rect" }> => …`).

### 5.2 Heavy tests: seed-deterministic, never clock-gated

A retry-until-unique generator or an exhaustive solve over several seeds legitimately
takes 1–3s solo, and under full-suite CPU saturation the same fixed work stretches
**5–10×** in wall clock (a ~3s Sixteen BFS has been *seen >29s*, and >170s on a box at
load ~32). The work is correct; only the clock moved. Rules:

- **Drive generation from a fixed seed** (`randomNew("…")`) so the work — and the
  pass/fail verdict — is identical every run regardless of load.
- **Never give a test its own timeout.** There is exactly one ceiling, `testTimeout`
  in [`vitest.config.ts`](../../vitest.config.ts), and it is a *runaway backstop, not
  a gate*: this box runs deliberately busy, and an otherwise-good commit must never be
  rejected merely because work took long. A per-test ceiling is a guess about
  contention — it can only be *tighter* than the global one, it is invisible from the
  config, and it must be re-guessed every time the suite grows. We carried 39 of them;
  Sixteen's went 30s → 60s → 120s and still failed a green commit.
- **Never assert `elapsed < N ms`** as a proxy for "the algorithm is efficient." That
  measures the box's spare capacity, not the code. Assert a load-independent proxy — a
  bounded node/expansion count, iteration count, or result shape (Sixteen's hint test
  asserts `__lastHintEngagedFallback() === false`, not "finished in < N ms"). This is
  what actually guards correctness, and it is why removing the clock gates cost no
  coverage.
- **A *hang* is not a slow test — and a timeout was never going to catch one.** These
  tests are synchronous, so a runaway loop blocks the event loop and the timeout's
  `setTimeout` cannot fire — the same mechanism that orphans vitest workers (see
  [`scripts/reap-orphaned-workers.sh`](../../scripts/reap-orphaned-workers.sh)). Bound
  non-termination **in the code**, where it can actually be caught: an operation budget
  that throws a labelled error in milliseconds
  ([`engine/step-budget.ts`](../../src/native/engine/step-budget.ts) for solver/hint
  fixpoints; [`engine/retry-limit.ts`](../../src/native/engine/retry-limit.ts) for
  generate-until-success retries). Make it opt-in/gated so it never touches a hot path
  (generation) where a false trip would itself be a real bug.

- **Don't judge a generator's *real* cost from a vitest run.** Vitest's module
  runner executes the code far more slowly than the shipped worker does, and a
  parallel suite adds contention on top. Spokes' 6×6 Hard generation measured
  ~20 s under vitest and **0.6–2.0 s** in a plain `node` process running the
  same seeds — a ~7× gap that briefly looked like a reason to diverge from
  upstream's algorithm. When generation cost looks like a product problem,
  re-measure it outside the test runner *before* designing a fix; and if you
  then optimise, a byte-match differential (§4.3) is what lets you prove the
  optimisation changed no behaviour. (`node --cpu-prof` needs the module graph
  to survive Node's type-stripping — a `readonly` **constructor parameter
  property** anywhere in it, e.g. `engine/retry-limit.ts`, makes it refuse.)

Normative: the `repo-layout` "test suite is deterministic under parallel load"
requirement. If a test fails only under load, **root-cause it** — but note that
"contention on work that terminates" is a complete diagnosis, and its fix is to stop
gating that test on the clock, not to re-guess a constant. Reach for the other causes
(shared state, order dependence, a logic edge case, genuine non-termination) when the
evidence points there: re-run the file alone, and re-run the suite under
`--sequence.shuffle.files=true` to localise a cross-file leak.

---

## 6. The two-stage parity gate (do not skip, do not shortcut)

Registration is gated on **owner-accepted full behavioural parity — rendering,
animation, input — not a green suite alone.** A green suite asserting only state
transitions can pass while the game does not render (this happened with Flip). The
authoritative rule is "Per-game hybrid; C deleted per game" in
[`ts-migration`](../../openspec/specs/ts-migration/spec.md); the parity-gate doctrine
is also in [`AGENTS.md`](../../AGENTS.md). **Never call a parity shortfall
"cosmetic"/"out of scope"/deferred without explicit owner approval.**

Two stages (owner-confirmed default since Galaxies):

1. **Register for smoke-testing** as soon as the automated suite is green — add the
   game to [`catalog-data.ts`](../../src/puzzle/catalog-data.ts) and import it
   in [`games/index.ts`](../../src/native/games/index.ts) so `registerGame(...)` runs.
   The empty-registry path is the C/WASM fallback; a registered game serves its TS
   impl. The owner smoke-tests the TS path in `npm run dev`.
2. **Delete the `.c` only on owner acceptance** — *(historical: this meant adding
   `TS_PORTED` to the game's `puzzle()` in `puzzles/CMakeLists.txt`, which kept the
   catalog/icon metadata while building no wasm, then deleting `puzzles/<game>.c`
   and rebuilding to confirm the game still appeared with no `<game>.wasm`.)*
   There is no C and no wasm build since `retire-c-engine`, so stage 2 has no
   mechanical content left — what survives is the rule that **owner acceptance,
   not a green suite, is the gate** on calling a game done.

**A third-party `puzzles/unreleased/` game that already ships C/WASM is the
easy case: flag in place, no catalog move.** Contrast §1.1's `unfinished/`
games, which are absent from the catalog and so must be *moved* into the main
`CMakeLists.txt` during stage 1 just to be visible. An `unreleased/` game
already has its `puzzle(<game> …)` entry built into `catalog.json` and already
runs on C/WASM, so stage 1 is just the two registration edits
(`catalog-data.ts` + `games/index.ts`) — `catalog-registry.test.ts` stays green
because the id is already in the catalog, and the C build remains the fallback
exactly as for a Tatham game. Stage 2 adds `TS_PORTED` to the entry where it
already sits in `puzzles/unreleased/CMakeLists.txt`, drops any `solver(<game>
…)` line beside it, and deletes the `.c`. Still `rm -rf build/wasm/` before the
rebuild.

Until acceptance the game stays unregistered and runs on C — the cost of this
discipline is ~zero.

---

## 7. Close out

Keep the openspec change current as you go (tasks ticked, design decisions
recorded). The pre-commit gate (`tsc -b --noEmit` → `biome check` → `vitest run` →
`vite build`) must be green; the prod build needs no generated assets present.

*(Historical note, resolved: this section used to say "format only your own files,
never a repo-wide `npm run check`", because the gate ran `biome lint` — which
skips formatting and import order — so the tree carried drift that a repo-wide
fixer would "fix" across 70+ unrelated files. Both halves were closed in July
2026: `6b4ff96` formatted the tree wholesale and `b42a829` moved the gate to
`biome check`/`biome ci`, so drift cannot re-accumulate and `npm run check` is a
no-op on an unmodified tree. Verified again 2026-08-01 — a repo-wide
`npm run check` during `establish-refactor-baseline` touched only the files that
change had edited.)*

On owner acceptance, do
stage 2 (§6) and **archive the change**
(`openspec archive add-<game>-ts-port --yes`) in the same commit as the C deletion.
See "Keep openspec changes current" in memory and the workflow in
[`OPENSPEC_AGENTS.md`](../../openspec/OPENSPEC_AGENTS.md).

If the game gets an explained hint, that is a **separate** change — see
[hint-authoring.md](./hint-authoring.md).

## 8. Refactoring metrics (`npm run metrics`)

`npm run metrics` records duplication (jscpd), runtime import cycles (madge,
calibrated), dead code (knip) and cognitive complexity (biome) into a dated,
committed `metrics/<date>/` snapshot. It is deliberately **not** in the gate —
its value is the diff between rounds, and a slow whole-tree scan buys a
per-commit gate nothing. Run it at the start and end of any refactoring change
and quote the delta.

Three rules, each learned by getting it wrong (`establish-refactor-baseline`):

1. **Thresholds are ratchets, never aspirations.** `biome.json` caps cognitive
   complexity at 150 with 19 individually-suppressed exceptions. Lower it when a
   change earns it; never raise it to accommodate new code, and never suppress
   without a specific reason — the suppression list *is* the work queue.
2. **Confirm every finding against the config the project actually runs.** The
   measuring config (`scripts/metrics-complexity.json`) sets
   `recommended: false` to isolate the complexity rule, which makes every
   `biome-ignore` for every other rule report as unused. That manufactured a
   phantom "35 free deletions" before anyone checked; the real count is 0.
3. **Know where your instruments clamp.** Biome's complexity counter **saturates
   at 255** — a function of true complexity 300 reports 255. Six solvers sit at
   the ceiling, so their true complexity is unmeasured and a stable 255 does not
   mean "no regression".

**Before adopting a shared abstraction, check its stated scope against its real
one.** `engine/deduction-fixpoint.ts` used to call itself "the one ordered-rung
loop every logic game hand-rolled" while fitting five call sites out of forty-odd
solvers, and that overclaim produced two wrong handoffs about Loopy. It now names
its known non-fits. The recurring shape: the ladder is generic, but the
bookkeeping wrapped around it is the game — Unruly grades by difficulty constant
rather than rung index, Singles drains an op queue per iteration, Spokes defines
a tier by accumulated action count, Lightup's rung order is load-bearing for
generation. **A solver whose loop resembles the shared one is not evidence that
it is the shared one; the differential is.**

**A difficulty-capped solver must be monotone in its cap** — a board solvable at
cap `d` must solve at every cap above it — and a converted or newly-tiered game
ships a property test saying so (`magnets.test.ts` is the pattern). Boats is the
known exception, recorded with its workaround: solve at each tier, take the first
that succeeds.

**Shared game mechanics live in `src/native/engine/`.** `border-grid.ts` is the
worked example: Palisade and Separate both mark the edges *between* cells with a
tri-state, and that mechanic — the bit vocabulary, the closest-edge hit test, the
half-cell cursor, `initBorders`/`buildDsf` — is now one module instead of two
byte-identical copies (469 clone lines → 280). The test for what belongs there is
not "is this the same text" but **"would a change here have to happen in both
games at once?"**; per-tile render loops look alike everywhere and stay per-game,
because the error conditions inside them differ. Each game keeps its own `Move`
type: the shared code reports which edge and how its state should cycle, never a
move, so two save formats stay uncoupled. And note the trap — the first cut
re-exported the vocabulary through each game's `state.ts`, which recreated the
clone as two identical re-export blocks. Import shared things from where they
live.

**Module layering is enforced** by `src/module-layering.test.ts`: no game
imports another game (shared behaviour goes in `src/native/engine/`), the engine
does not import games (except `engine/testing/hint-games.ts`, the hint
enrollment file), neither imports the app shell, and `preflight.ts` stays inside
its Baseline 2023 gate. The same file ratchets runtime import cycles at zero.
Every rule there has been verified to fail when violated — a layering rule that
has never fired may not work, and its whole value is firing years from now.

**One lint rule is deliberately off.** `complexity/useLiteralKeys` wants
`v.foo` wherever a string-literal key is used — the exact inverse of tsconfig's
`noPropertyAccessFromIndexSignature`, which requires `v["foo"]` for a property
that comes from an index signature. Enabling the compiler flag put 52 sites in
direct contradiction between the two tools. The flag wins (bracket access
truthfully marks a key as dynamic, which is what `ConfigValues` and the save
codec's unknown-shaped input actually are), so the biome rule is off. When
adding a lint rule, check it does not invert a compiler flag.

And when reading a raw madge cycle count: it is **not** a runtime-cycle count
here. `verbatimModuleSyntax` erases `import type`, and moving a shared type
behind one *is* the standard cycle fix — so madge reports the fix as the problem.
Measured 2026-08-01: 20 raw, 1 runtime. `scripts/metrics-cycles.mjs` does the
calibration and treats an edge it cannot classify as a failure, not as clean.
