# Design — add-crossing-ts-port

## Context

Crossing implements *Nansuke* (Number Skeleton), a Nikoli number-crossword: a
walled grid plus a list of multi-digit numbers, and the player fills every open
cell with a digit `1`–`9` so that each listed number appears **exactly once**
when the grid's maximal horizontal and vertical runs (length ≥ 2) are read
left-to-right / top-to-bottom. It is a genuine deductive logic puzzle: the C
generator gates every board on a constraint-propagation solver reaching a unique
solution, so a generated puzzle is always solvable by pure deduction.

The source (`puzzles/unreleased/crossing.c`, ~2,040 lines) is **self-contained**
apart from one leaf, `dsf` (used once, in the generator's connectivity check —
`solver(crossing dsf.c)` in `puzzles/unreleased/CMakeLists.txt`), which is
already ported to `src/native/engine/dsf.ts`. The frontend (`interpret_move`,
`execute_move`, `game_redraw`, `new_ui`) is finished and good; this is an
ordinary idiomatic port, not a "finish the frontend" job. Unlike Tatham's
`unfinished/` games, an unreleased game already ships as a C/WASM catalog entry,
so the two-stage parity gate works normally: registering serves the TS engine
while the C/WASM binary stays built as a comparison fallback until stage 2.

**Long-tail risk checklist (playbook §1) — clean.** Crossing's `set_public_desc`
is `NULL` and it does not supersede its desc; it compares no stringified state
for undo (no-op moves are suppressed *locally* in `interpret_move` by returning
`NULL`, exactly as Galaxies does — D5); it has no `#ifdef EDITOR` move letters;
and `game_print` is an empty stub with the print flags `false`, so it makes no
print promise. None of the long-tail traps bite.

## Decisions

### D1 — Desc codec: run-length walls + a `,`-joined number list, ported as an exact inverse

The desc is `<walls>,<num1>,<num2>,…` (`crossing.c:1123` encode /
`crossing.c:296` decode). The wall section is a run-length encoding that reads
**backwards from the field names' hint**: a **decimal number** is a run of that
many *open* cells; a **letter** `a`–`z` is a run of `1`–`26` *wall* cells
(`a` = 1 … `z` = 26). Cells are laid out row-major; the two run kinds alternate.
The number list is each clue number as decimal digits, comma-separated, the
final comma replaced by the terminator. Port `newState`'s decode and
`newDesc`'s encode as exact inverses (byte-match surface, D7).

`validateDesc` reproduces upstream's `crossing_read_desc` verdict set: reject an
unknown wall character (`INVALID_WALL`), a description that carries more cell
data than the board holds — i.e. no `,` after `w*h` cells — (`INVALID_TOO_LONG`),
a number longer than the max row length (`INVALID_NUMBER`), and a duplicate
number (`INVALID_DUPLICATE`). Two upstream facts to preserve deliberately rather
than "improve":

- **`maxrow` is hard-coded to 9**, not scanned from the grid (the C carries a
  `TODO actually scan area for longest row`). Keep `9`; the `INVALID_MAXROW`
  branch is therefore unreachable, exactly as upstream.
- **The decode is deliberately lenient** — upstream's own TODO list says it does
  not check for too-*short* descriptions or invalid digit characters (e.g. `0`).
  Port the checks that exist; do not add the missing ones (they would reject
  descriptions the C accepts and are outside this port's scope). Record the gap
  in `state.ts` so a reader does not "restore" a check that was never there.

Numbers are stored **sorted by (length, then lexicographic)** (`cmp_numbers`),
because both the solver and the encoder walk them in that order and the desc's
number list is emitted sorted — so the sort is part of the byte-match surface,
not a display convenience.

### D2 — Solver: idiomatic constraint propagation, a full unique-solution solver

`crossing_solve_game` (`crossing.c:853`) is a fixpoint over two deductions on a
per-cell candidate bitmask (`marks`, bits for digits `1`–`9`):

1. **`crossing_solver_marks`** — for each run, over every not-yet-placed number
   of the run's length that still fits the current candidates, union each
   position's digit into a positional accumulator; then intersect each open
   cell's candidates with that accumulator. (A cell's reachable digits are only
   those some still-fitting number puts there.)
2. **`crossing_solver_confirm`** — any open cell whose candidates collapse to a
   single digit is placed (naked single).

The loop runs `crossing_validate` first (which returns `valid` / `invalid` /
`progress`), stops when not `progress`, and otherwise applies the two deductions;
it terminates when a pass makes no change. `valid` means the board is uniquely
and fully solved by this technique.

Port it idiomatically: a discriminated `SolveStatus = "valid" | "invalid" |
"progress"` (not C's magic `STATUS_VALID/INVALID/PROGRESS` ints), the candidate
mask as a `number` bitmask, runs as a `CrossingRun[]` (`{ row, start, len,
horizontal }`) from a `collectRuns(walls, w, h)` helper. `crossing_validate`
carries a subtle upstream shape — its `done[]` accumulator is sized by number
count but the completion re-scan indexes it by run count, which coincide only
because a solved Nansuke has one number per run. Port the logic as written but
**comment the coincidence**, since it is load-bearing and non-obvious. The
solver has one technique tier (`TODO harder techniques?` in the C); there is no
difficulty parameter, so no grading.

### D3 — Crossing is uniquely solvable: it ships `findMistakes` (and later, a hint)

The generator gates on the solver reaching a unique solution (D4), so every
board has exactly one answer reachable by deduction. Per playbook §3.5, a game
with a unique solution **SHALL** ship `findMistakes` — Check & Save hard-blocks a
save only when `canFindMistakes` is true, and a uniquely-solvable game without
the hook silently saves a wrong board. So `findMistakes(state)`:

- Re-solves from the puzzle's walls + numbers to the unique solution grid (reuse
  D2's solver on a fresh candidate state).
- Flags every **placed digit** that contradicts the solution (`kind: "cell"`)
  and every **pencil-noted** empty cell whose notes have crossed out the cell's
  solution digit (`kind: "note"`), per the cross-game notes-are-first-class
  convention (playbook §3.7). Notes with merely extra candidates are ordinary
  mid-solve state and are not flagged.
- Returns `[]` when the board is not (yet) uniquely determined from the givens.

The flagged cells render with a distinct `COL_ERROR` inset overlay, folded into
the per-tile cache diff key via an `OverlaySidecar` (playbook §3.2 — an overlay
absent from the diff key never repaints).

**Retain the live run-error highlight as faithful display, distinct from
`findMistakes`.** Upstream draws a red rectangle around any *full* run that
matches no listed number (`crossing_validate`'s `runerrs`), computed every
`redraw`. That is an always-on "this run is provably wrong" cue and stays; it is
independent of Check & Save's re-solve. The two coexist: the run highlight fires
on a completed-but-unmatched run, `findMistakes` on a placed digit that differs
from the unique answer.

An **explained hint** — narrating *why* a digit is forced (e.g. "only `47` fits
this length-2 run, so this cell is `4`") — is a strong fit for crossing's
deductions but is, as with every port, a **separate future change**, not this
one.

### D4 — Generator: shuffle-driven wall growth + digit fill + solver gate, byte-match portable

`crossing_generate` (`crossing.c:1096`), retried by `new_game_desc` until it
succeeds, is byte-match portable and ported faithfully:

1. **`crossing_gen_walls`** — start every cell blank; `shuffle` the cell-index
   list once (the sole wall-phase RNG draw); walk it turning cells "open" until
   two constraints both hold: **`checkpool`** (no 2×2 block is entirely
   non-open — this forbids fat wall blocks and 1×1 isolated cells, and it
   *mutates* the grid by forcing a wall wherever a 2×2 is all-but-one open) and
   **`checkdsf`** (all open cells form a single connected component, via the
   shared `Dsf`). With symmetric walls, each opened cell also opens its
   180°-rotational partner. `checkpool`'s side-effecting wall placement is part
   of the algorithm and must be ported verbatim — the merge/pool decisions gate
   which board results and therefore the desc.
2. **`crossing_gen_grid`** — fill every cell with `1 + randomUpto(rs, 9)`
   (`w*h` draws, the only grid-phase RNG). This is the candidate *solution*.
3. **`crossing_gen_numbers`** — collect the runs, read each run's digits into a
   number string, sort, and reject if any two numbers are equal (Nansuke forbids
   duplicate clues) or a run exceeds the max length.
4. **`crossing_gen_solve`** — run the D2 solver on the walls+numbers; accept only
   if it reaches `valid` (unique solution). Otherwise the whole generate retries
   with fresh RNG draws.

The RNG surface is exactly `shuffle(cells)` then `w*h × randomUpto(9)`; the rest
is deterministic. So the desc is a pure function of the seed and reproduces
byte-for-byte (D7). Because generation is solver-gated, that single byte-match
also validates the solver on every board it accepts.

### D5 — Input: Solo-style ink/pencil selection, a discriminated-union move

Crossing's controls mirror Solo (per its own docs). Model the move as a
discriminated union, not upstream's `"R…"`/`"P…"`/`"S…"` strings:

```ts
type CrossingMove =
  | { kind: "set"; x: number; y: number; digit: number | null }    // ink: place/clear a digit
  | { kind: "pencil"; x: number; y: number; digit: number | null } // note: toggle a mark, or clear all (null)
  | { kind: "solve"; grid: ReadonlyArray<number> };                // fill from the solver
```

`interpretMove` builds these directly from the pointer / keyboard, all cursor
state living on the ephemeral `Ui` (`cx`, `cy`, `cshow`, `cpencil`, `ckey`),
never on the state:

- **Left-click** an open cell → ink-select it (or deselect on a repeat click);
  **right-click** → pencil-select. Convert the pointer with the shared
  `fromCoord`, accounting for crossing's **half-tile** top-left margin
  (`FROMCOORD(x) = (x - tilesize/2) / tilesize`, D9) — this is *not* the
  `NARROW_BORDERS` zero-border geometry other ports use.
- **Arrow keys** move the cursor (`gridCursorMove`); **Enter** toggles
  ink/pencil mode.
- A **digit** `1`–`9` enters (ink) or toggles a note (pencil); **Backspace /
  Space / `0`** clears. Suppress no-op moves *locally* by returning `null`
  (ink move equal to the current digit; pencil edit of a filled cell; any edit
  of a wall) — the same "suppress in `interpretMove`" technique the long-tail
  checklist prescribes, never state-string comparison.

**Restore the on-screen keypad.** Upstream's `game_request_keys` offers `1`–`9`
plus backspace; implement `requestKeys` returning `digitKeys(9)` (which appends
the `{ button: 8, label: "Clear" }` key), so the TS path keeps the touch-primary
digit keypad it would otherwise lose (playbook §3.8).

**Pencil-mark UX (playbook §3.7).** Crossing is a pencil-mark game, so ship the
faithful ink/pencil model above plus the two cheap default-on divergences that
travel with it: a **sticky pencil mode** (`pencilSticky` `Ui` boolean via the
`prefs` hook) and a **pencil-mode indicator** glyph. Skip the *adaptive mark-all
cleanup* — that requires a per-cell uniqueness-region model (`regionsOf`), and
crossing's constraint is a whole-run-matches-a-number relation, not a row/column
Latin uniqueness, so the cleanup has no clean definition here. Upstream also
ships no `M` mark-all key, so omitting it is faithful too. Record this so it is
not read as an oversight.

### D6 — Completion and text format

`executeMove` sets `completed` when `crossing_validate(state) == valid` after an
ink move — i.e. every run matches exactly one number and each number is used
once. Port that as the win condition (a pencil move can never complete, since it
leaves the grid unchanged). `solve()` re-runs the D2 solver and returns a
`{ kind: "solve" }` filling the grid; it needs no generator `aux` (the solver
re-derives the answer from walls+numbers), so no `aux` threading (playbook §3.6).

`game_text_format` returns the grid (walls as `#`, digits, `.` for empty)
followed by the number list grouped by length. Widen nothing: ship `textFormat`
returning the string and keep `canFormatAsText` `true` (upstream's
`game_can_format_as_text_now` is unconditionally `true`).

### D7 — Differential: a byte-match desc check across presets, a size sweep and the sym variant

Add `puzzles/auxiliary/crossing-trace.c` on the established pattern
(`#include "../unreleased/crossing.c"` to reach the `static` generator; print the
generated desc as JSON for `(w, h, sym, seed)` tuples), plus its `cliprogram()`
line. The gated `crossing-differential.test.ts` asserts the TS `newDesc`
reproduces the C desc **byte-for-byte** for each preset (5×5, 7×7, 9×9), a small
size sweep, and at least one **symmetric-walls** configuration (the `sym` path is
a distinct RNG branch — the mirror-cell opens — and must be covered).

This is the strongest check available and the right default here (playbook §4):
generation is solver-gated, so a single byte-match validates the generator, the
solver *and* the codec together over the bit-identical `random.ts`. Build the
trace harness pure-C (`-DUSE_TS_RANDOM=0`, playbook §4.2 gotcha). The advisory
live `scripts/diff-crossing.test.ts` is optional and, if added, is deleted with
the C at stage 2 (playbook §4.1).

### D8 — Leaf-lib reuse: only `dsf`

Crossing's `solver(crossing dsf.c)` names its one leaf dependency: `dsf`, used
solely in `crossing_gen_walls_checkdsf` for the open-cell connectivity check.
Reuse the shared `src/native/engine/dsf.ts` `Dsf` (union-by-size); the check
reads only membership and component size, both of which are root-choice
independent, so it is byte-match portable on the shared `Dsf` without matching
`dsf.c`'s internal root selection (playbook §2.2). No `latin`/`matching`,
`grid`, `findloop`, or `tree234`/`SortedMultiset` is needed — crossing uses none
of them.

### D9 — Rendering: faithful tiles + the number-list panel; display code, an improvement opportunity

Port `game_redraw`/`draw_tile` faithfully in look, cleanly in code (display is
outside byte-parity scope — playbook §3.2, §4):

- **Geometry.** `computeSize` is `(w+1) × (h+1+3)` tiles: a **half-tile margin**
  on every side of the grid (hence the `- tilesize/2` in `fromCoord`, D5) plus a
  **3-tile-high number-list panel** below the grid. Crossing does **not** use
  `NARROW_BORDERS`; this is its own geometry, checked against the source, not
  assumed.
- **Cells.** Bevelled tiles (light/shadow polygons + inset) for walls (wall
  shades) and for placed digits (each digit `1`–`9` in its own colour from the
  `bgcols` table), the number drawn with an outline; open cells show the inner
  background or a cursor highlight; pencil marks drawn as a small digit grid;
  the run-error red rectangles (D3) around provably-wrong full runs. Pack the
  per-tile state into an `Int32Array` cache key with every overlay (cursor,
  error, flash, findMistakes) in the diff key (playbook §3.2).
- **The number-list panel.** Draw the clue numbers grouped by length, coloured
  by done-state (unused / used-once dimmed / duplicate-red, from
  `crossing_validate`'s per-number `done`). Upstream's Status doc names fitting
  this list the puzzle's "largest problem," a framework limitation (fixed window
  per params) this fork is **not** bound by. So this is the one real display
  *improvement* opportunity: render the list legibly for a varying count (wrap /
  scale within the reserved area, or reflow), a deliberate divergence — not a
  pixel-match of the C's cramped layout. Keep it clean; do not over-engineer.
- **Palette + flash.** Mirror the C colour-enum order index-for-index (the
  `augmentation.ts` crossing entry currently declares no dark-mode
  `paletteSwaps`, but keep the order faithful so a later override targets the
  right index — playbook §3.3). Completion flash over `FLASH_TIME = 0.72 s`
  cycles the digit colours; fire it only on the not-cheated completion
  transition (upstream `game_flash_length`).

Ship a tier-2.5 render-scenario test + snapshot for a mid-solve frame, a
run-error frame, a `findMistakes` overlay frame, and a completion-flash frame.

### D10 — Params, config summary, custom dialog

Params are `{ w, h, sym }`. `validateParams` reproduces upstream exactly: reject
when **both** `w < 4` and `h < 4` ("width or height must be at least 4"), then
`w < 2`, then `h < 2` — i.e. both dimensions ≥ 2 and at least one ≥ 4.
`decodeParams`/`encodeParams` are `%dx%d` (square fallback when the `x` is
absent) with a trailing `S` for symmetric walls (emitted only on a full encode).
Presets: 5×5, 7×7, 9×9, all non-symmetric.

`describeParams` must emit the keys the existing `augmentation.ts` summary
`"{width}x{height}{symmetric-walls:|, symmetric}"` reads: `width`, `height`
(strings), and `symmetric-walls` as the **0/1 index** (`0` → "", `1` →
", symmetric") — a numeric choice index, not a boolean (playbook §3.4).
`paramConfig` supplies the Custom dialog: Width / Height string items
(`parseConfigInt`) and a "Symmetric walls" boolean item, keys matching the C
config slugs (`width`, `height`, `symmetric-walls`).

## Risks

- **Byte-match hinges on faithful `checkpool` side effects and the number sort.**
  `crossing_gen_walls_checkpool` both *tests* and *mutates* the wall grid inside
  the growth loop, and `cmp_numbers` orders the emitted list; a subtle divergence
  in either changes the desc. Transcribe both carefully and lean on the D7
  differential to catch drift. This is the main port risk.
- **The lenient/quirky codec.** The hard-coded `maxrow = 9`, the missing
  too-short / `0`-character checks, and the `done[]`-sized-by-numbers /
  indexed-by-runs coincidence in `crossing_validate` are all faithful upstream
  behaviour that a "cleanup" would silently change. Port as-is with comments
  (D1, D2).
- **Number-list layout is genuinely open-ended** (upstream never solved it). Keep
  the improvement scoped to "legible for a varying count within the reserved
  panel"; it is display code, so it neither gates the differential nor blocks
  registration — but it does matter for owner-acceptance playability.
- **Small, self-contained, one already-ported leaf.** Otherwise a low-risk port:
  no aperiodic geometry, no Latin framework, a single deductive solver tier.

## Open questions for the owner

None blocking. Two judgment calls resolved in the design, flagged for visibility:

1. **Number-list rendering (D9).** The design commits to legibly reflowing the
   clue list within the reserved panel (a deliberate divergence from upstream's
   cramped fixed layout) rather than reproducing the C pixel-for-pixel. If the
   owner prefers a strict visual match, say so at acceptance.
2. **Pencil-mark extras (D5).** Sticky pencil + a mode indicator ship; adaptive
   mark-all cleanup is skipped for lack of a clean uniqueness-region model.
   Reversible if the owner wants the full §3.7 set.

## Findings from the implementation

### F1 — The byte-match differential came out green 25/25 on the first run

All three presets (5×5, 7×7, 9×9), five symmetric-wall configurations and a
4×2→10×7 size sweep reproduce the C description byte-for-byte. Because the
generator retries until the deductive solver reaches a *complete unique* answer,
that single assertion validates the wall-growth loop (including `checkPool`'s
mutate-while-testing), the digit fill, the run-collection emission order, every
deduction the solver makes, and the codec — all at once. Generation is also
cheap: all 25 C fixtures take 0.6 s end to end, so no retry-budget concern
arises and `retryLimit`'s house default is only a runaway backstop.

Three details of the C that the byte-match would have caught had they been
"tidied", and which are therefore transcribed literally with comments:

- **`checkPool` both tests and mutates**, and its four quadrant rules see each
  other's writes within the same 2×2 (the top-left rule can turn an *already
  open* cell into a wall, which then makes the top-right rule's guard fail).
- **The check runs *before* each cell is opened**, not after, so the loop's exit
  state is the board as it stood one opening earlier.
- **`checkDsf` merges on the three-valued cell state**, not on "is a wall", which
  is what makes "the largest class containing an open cell holds every open cell"
  a correct connectivity test.

### F2 — Upstream's completion "flash" is a static colour shift; the port animates it

`game_redraw` declares `bool flash` and then assigns `(int)(flashtime/FLASH_FRAME)`
to it, so the frame counter collapses to `1` for the whole animation and every
digit simply shows the *next* colour for 0.72 s. `FLASH_TIME` is defined as
`FLASH_FRAME * 9` and the colour index is `(x + y + flash) % 9`, so a nine-phase
cycle is unmistakably what was intended. Display was never in byte-parity scope
(playbook §4 intro), the fix is one type, and the result is a real celebration
animation, so the port keeps `flash` as the integer phase. Recorded here because
it is a *deliberate* divergence, not an oversight; guarded by a tier-2.5 test
asserting two flash phases paint different digit colours, and confirmed in the
browser.

### F3 — `drawRectCorners` promoted to `engine/draw.ts` (seven existing copies)

Crossing's keyboard cursor would have been the **eighth** private copy of
upstream's `misc.c draw_rect_corners` (ascent, bricks, dominosa, signpost,
singles, spokes, subsets each carried one). It is frozen upstream code with a
fixed shape, which is exactly the owner's "refactor as you go" criterion, so it
moved to `src/native/engine/draw.ts` and all seven games were refactored onto it.
The emitted line order is unchanged, so no render snapshot moved — the seven
games' 381 tests stayed green through the refactor, which is what makes this kind
of extraction cheap to verify.

### F4 — `FROMCOORD` is truncating division, so the margin belongs to cell 0

Crossing's `FROMCOORD(x) = ((x) - (tilesize/2)) / tilesize` is C integer
division, which truncates toward zero: a pointer inside the half-tile top/left
margin yields `0`, not `-1`. The shared `fromCoord` floors and would reject those
pixels. Ported with `Math.trunc` (the same call Sticks made, playbook §3.8e) so a
click just outside the grid's top-left selects the first cell exactly as the C
build does.

### F5 — Three upstream shapes that read like bugs and are not

Each is commented at its site so a later reader doesn't "fix" it:

- **`crossing_solver_marks`' change counter cannot spin.** It counts a cell
  whenever `cand !== acc`, not only when the intersection removes something —
  which would loop for ever if `acc` could exceed `cand`. It can't: a number
  contributes to `acc` only when *every* one of its digits is still a candidate
  in its own cell, so `acc ⊆ cand` always, and a difference means a strict subset.
- **`crossing_validate` computes `full` across the numbers of matching length,
  not per number**, so a run whose length matches *no* listed number keeps
  `full = true` with `any = false` and is flagged as an error. That is the right
  answer (no number can ever go there) but it is not what the control flow looks
  like.
- **`crossing_solver_confirm` scans `j` from 0**, where `NUM_BIT(0)` is a shift by
  −1. In C that is undefined behaviour that happens to be harmless (no live mask
  can equal the result); JS masks shift counts the same way, so the port would
  have been bug-compatible for free — but the loop simply starts at 1, which is
  the identical set of placements and needs no comment about UB.

### F6 — The `done[]` size/index mismatch is bounded rather than reproduced

`crossing_validate` allocates `done` with one entry per *number*, fills it by
number index, and then re-scans it by *run* index. Those coincide for every
generated board (a solvable Nansuke has exactly one number per run), but a
hand-authored description with a mismatched count makes the C read past its
allocation. The port sizes `done` to `max(numbers, runs)`, which is identical
behaviour wherever the C is well-defined and simply doesn't read out of bounds
where it isn't (playbook §4 rule 1 — divergence is free where C has no defined
behaviour).

### F7 — Two small behavioural improvements over the C, both recorded

- **`solve()` reports failure instead of filling a partial answer.** Upstream's
  `solve_game` writes whatever the solver deduced and `-` elsewhere, so an
  unsolvable board silently half-fills. The port returns
  `{ ok: false, error }`, matching every other port and the app's Solve
  affordance. Unreachable on a generated board.
- **The solve arm sets `cheated` unconditionally** (upstream ties it to
  `completed`), per playbook §3.6, so a Solve that somehow didn't finish still
  suppresses the celebration flash on a later manual completion.

Plus one input refinement: with the fork's sticky pencil mode on, a left-click on
a *filled* cell does not select it while in pencil mode — the cell cannot take a
mark, so highlighting it only suggests an edit that can't happen. Upstream
already does exactly this on its right-click (pencil-select) path.

### F8 — D9's number-panel worry, corrected twice

**First pass (wrong in its reasoning, and premature).** Reading `draw_numbers`
shows it already grows the row count and shrinks the font until the widest number
of each column fits the board width; it laid out 8 numbers on a 4x2 board and 22
on a 9x9 legibly, so the finding recorded "no divergence warranted" and added
that upstream's TODO is about "its *fixed window height*, which this frontend
does not impose."

**That last clause is false**: `Game.computeSize(params, tileSize)` takes params
only, exactly like upstream's `game_compute_size`, so this fork inherits the same
constraint — the window for a given size is fixed while the clue count varies
with the description. The claim was also made without looking at the large end,
which is where the author's complaint actually lives.

**Second pass, with measurements.** Rendered at the top of the generable range
(15x15, 59 numbers) the panel is genuinely fine: 5 rows x 12 columns, ~0.36 tiles
of font. What is *not* fine is beyond it — see F12. Capping the params where
generation actually works also caps the clue list, so "there is no reliable way
to always fit the list on screen" stops being reachable rather than being solved
by layout cleverness. That is the honest resolution: the framework limitation is
real and unfixed, and the port makes it unreachable instead.

### F9 — The author's own Status notes were not read, and they change the port

`puzzles/unreleased/docs/crossing.md` carries a `## Status` section opening "This
puzzle has severe problems", listing three. The port originally shipped having
read only the `TODO` block at the top of `crossing.c`, which covers two of them
more weakly and omits the one that mattered most (automatic cursor movement).
The general rule is now **playbook §1.0** — read `docs/<game>.md` before the C —
and it is load-bearing for the four remaining unreleased ports, especially
seismic ("near-zero chance of generating sizes higher than 7x7. The generator
step ... needs to be completely replaced").

Resolutions, owner-decided where it was a taste call:

- **"Inputting a complete number ... is fairly tedious and could be enhanced by
  automatic cursor movement."** -> implemented, F10.
- **"The colored digits ... should probably be removed entirely."** -> removed, F11.
- **The number list cannot reliably be made to fit.** -> made unreachable, F8/F12.

### F10 — Cursor auto-advance, with a crossword's direction model

Entering a digit now steps the selection to the next cell of the run being
filled, so a whole number is typed in one go instead of clicked cell by cell. The
direction is a sticky `Ui` field, and three things keep it from becoming a hidden
mode the player fights:

- **Snapping.** Selecting a cell that lies in only one run sets the direction to
  that run — most cells beside a wall answer the question by themselves.
- **Arrow keys** set the direction they move in (then snap, so a Down press on a
  cell with no vertical run doesn't leave the cursor pointing nowhere).
- **A repeat click at a crossing toggles across/down** (the crossword
  convention). Where there is nothing to toggle — a wall, pencil mode, or a cell
  in a single run — the repeat click still deselects exactly as upstream's does,
  so the gesture is never taken away without giving something back.

`CrossingPuzzle` gained `acrossRun`/`downRun` (per-cell run indices, built once
in `makePuzzle`) so all of this is lookups rather than searches. Behind an
`auto-advance` preference, default on. Deliberately **not** implemented: any
advance on a *clear* (crosswords move backwards there, and guessing wrong is
worse than doing nothing) or on a pencil mark.

The owner chose this over the smaller "arrows only" model, and declined the
optional third piece — tinting the cells of the active run so the direction is
visible. The direction is therefore currently inferred rather than shown; the
tint remains a cheap follow-up if it reads as a hidden mode in play.

### F11 — The per-digit colours are gone

Upstream painted each digit `1`-`9` its own saturated tile colour. Per its
author that was "part of a scrapped idea where complete numbers could be dragged
and dropped ... As it stands, the colors should probably be removed entirely" —
and they encode nothing the digit does not already say, while nine hues across a
15x15 board are loud. Owner-confirmed, so an entered digit is now a **raised
neutral tile with a plain black digit**: the bevel carries "placed", and a
selected filled cell still inverts its bevel to read as pressed.

Consequences worth knowing:

- The palette drops from 37 entries to 11; the 27 `COL_NUM*` entries and the
  `draw_text_outline` helper (which existed only to keep a digit legible on a
  saturated tile) are deleted, taking ~96 lines out of the render snapshot.
- Pencil marks lost their per-digit colour and take `COL_PENCIL`, the muted
  blue-grey ABCD and Towers use.
- **The completion flash had to be re-founded**, since it cycled those colours.
  It is now the diagonal highlight/lowlight wave ABCD uses, over the same
  `FLASH_TIME`. F2's finding (upstream's frame counter is a `bool`, so its
  animation never moved) still applies and is still fixed — the tier-2.5 test
  asserts a settled board paints no flash colour and that two phases light
  *different* cells, which is what proves the wave moves.

### F12 — A generable-size ceiling, because upstream has none

`validate_params` sets no upper bound and `new_game_desc` retries until it
succeeds, so a large Custom board makes the C **spin for ever**. It is not
impatience: an attempt is rejected if any two runs read as the same number, and
the run count grows with the area, so the collision becomes near-certain (a
birthday problem over at most 81 two-digit numbers).

Measured across a grid of shapes, 3 seeds each, 10,000-attempt budget:

| area | outcome |
| --- | --- |
| <= 225 (15x15, 16x14, 18x12, 20x10 ...) | 3/3, worst 0.9 s |
| 240-256 | 1/3 - 3/3, up to 3.5 s |
| >= 280 (20x14, 18x16, 24x12, 18x18 ...) | **0/3** |

That is playbook section 4's *impossible* case, not its *unlucky* one, so it is
rejected in `validateParams` with the measured boundary (`MAX_AREA = 225`)
rather than a guessed one — and only on a `full` validation, so an existing
description of any size stays playable. The app now answers an 18x18 request
immediately ("Width times height must be at most 225; larger boards cannot be
generated") instead of hanging or throwing `RetryLimitExceeded` after ~7 s.

### F13 — Isolated open cells are no longer generated

Upstream's first generator TODO is "Some puzzles have isolated squares (1x1
areas)", and it means it: an open cell whose four neighbours are all walls lies
in **no run**, so no clue number can reach it. It stays blank on a finished
board (the owner found one bottom-left of a solved 5x5), and because the
completion check only inspects runs, a player can type any digit into it and
still win.

Measured frequency of a board containing one: **4% at 5x5, 7% at 7x7, 17% at
9x9, 18% at 12x12** (2-5% with symmetric walls). Rejecting those candidates
therefore costs a few percent more attempts on a generator that produces a 9x9
board in well under a millisecond — so this is playbook §4 rule 3, a genuine
player-visible defect rather than a difficulty curve, and cheap to fix.

The fix costs the byte-match oracle nothing, using the Spokes `upstreamDirtyGate`
pattern (playbook §4.4): a `CrossingGenOptions.upstreamIsolatedCells` flag
restores upstream's exact behaviour and is set **by the differential alone**. All
25 fixtures still match the C byte-for-byte; the only code outside the oracle's
reach is the four-line rejection itself, which gets two behavioural tests
instead — one asserting no generated board has an unreachable cell, and one
asserting the flag still *changes* the description on a known seed, so the
differential cannot silently decay into testing the shipped path.

Not changed: `newState` still decodes such a description faithfully if given one,
so an existing puzzle plays exactly as before. Nothing shipped can contain one
(Crossing has not been accepted, so no game IDs are in circulation), which is why
this stops at generation rather than also rewriting the decoder.

### F14 — The clue list becomes an input surface (the author's scrapped idea)

The author's third Status point explains that the per-digit colours were "part
of a scrapped idea where complete numbers could be dragged and dropped with the
mouse". F11 removed the colours; this implements the idea they were left over
from, with clicks instead of a drag:

- **Click a clue in the list to pick it up.** It is highlighted (`COL_HELD`) and
  ghosted (`COL_GHOST`) into every run that can still take it. Clicking such a
  run writes the whole clue in as **one move**, so it is one undo step. Clicking
  the held clue again puts it back; clicking anywhere it cannot go drops it and
  selects normally.
- **With a cell already selected, clicking a fitting clue places it at once** —
  the owner's request, and the fastest path once you know the answer.
- **Selecting a cell dims the list** to the clues that can still go in its run.

Two decisions worth keeping:

**How strong the "fits" test is (owner-decided).** A clue fits a run when it is
the right length, agrees with every digit already typed there, and is not already
written into another run. That is *pattern matching over the player's own
entries* — the scan they would do by eye. The tempting next step, rejecting a
clue because it would leave a crossing run unsatisfiable, is constraint
propagation: the solver's first deduction rung, and therefore the puzzle itself.
It belongs to a future `hint()`, not to an input aid. The line is worth holding
because the stronger version is barely more code and would quietly solve a large
part of the board for the player.

**Which run receives it.** A clue occupies a whole run, so its *length* settles
the target in almost every case — most cells have only one run of that length
through them. Only when both runs through the selected cell are the right length
and both admit it does the existing fill direction (F10) decide. No new gesture
was needed.

**Why this grammar and not Ascent's.** Ascent ghosts a candidate into a cell,
accepts it with a left-click and cycles alternatives with a right-click. Both of
those gestures are already spoken for here — a repeat left-click flips the fill
direction (F10) and right-click toggles sticky pencil — so adopting Ascent's
grammar would have meant moving sticky pencil to middle-click. Choosing the clue
from the list instead removes the need to cycle at all: you can see every
candidate at once, which is strictly more information than a ghost you step
through. Ascent's model remains right *for Ascent*, where the candidate is
arithmetic (`N ± 1`) rather than a choice from an inventory.

`layoutNumbers` in `render.ts` is shared by the renderer and `interpretMove`, so
the two cannot disagree about where a clue is — the same rule as Bricks' shared
`offsets` (playbook §3.13). Behind a `fit-highlight` preference, default on.

### F15 — The preview asserted placements it could not know (owner-found)

F14's first cut ghosted the held clue's digits into **every** run that could
still take it. On the owner's 5x5 board, clicking `834` wrote `8 3 4` into both
the left column and the bottom row at once; the board appeared to be telling the
player where the clue went, when all it knew was where it *might*. Measured on a
fresh 9x9: a 2-digit clue matches **10** runs, a 3-digit clue 7, a 4-digit clue
5. It was also unsound — two candidate runs can cross, and the shared cell took
whichever run's digit was written last, so one of the two previews could show a
digit the clue does not have there.

Split into two signals, which is what the aid actually knows:

- **A wash (`COL_CANDIDATE`) over every run the clue could go in** — the honest
  answer to "where might this fit", and calm enough to show ten at once.
- **Ghosted digits only when exactly one run remains.** That is the case where
  the preview is a prediction rather than a list of options, and it makes the
  crossing-runs conflict unreachable by construction.

The same wash answers the owner's other request at no extra cost: **a clue
already written into the board washes the run it occupies**, so clicking it
finds it. Previously that click highlighted the clue in the list and did nothing
visible on the board.

One wart the browser check caught: dropping a held clue onto a run left the
selection hidden, so the next keystroke was silently ignored. The cell the clue
landed on now stays selected.

### F16 — The clue list needs five states, not three (owner-found)

Two faults, both from collapsing distinct meanings onto one grey.

**"Already used" became indistinguishable from "cannot go here".** Before the
aid, the list said exactly one thing: black = not yet placed, grey = placed once,
red = placed twice. The fit-highlight then greyed out the clues that cannot go in
the selected run — using the *same* grey, so the player lost the ability to see
which clues they had already used. Fixed by crossing a used clue **off the list**
with a strike-through, which is what a player does on paper: dimming now means
"not here", striking means "used up", and the two compose.

**Only one of the two runs through a cell was consulted.** `selectedRun` read the
run along the fill direction only, so at a crossing the list answered for the
across run and silently ignored the down one — while a click on a clue that fits
only the crossing run *does* place it there (`runForNumber` already tries both).
The display was therefore narrower than the behaviour. Now the list distinguishes
them: a clue that fits the run being filled stays black, one that fits the
**crossing** run is drawn in `COL_CROSSFIT` (amber), and only a clue that fits
neither is dimmed.

The colour needs a referent or it is just a second arbitrary shade, so **the
crossing run is washed on the board in the matching amber** (`COL_CROSS`). This
revisits the "no run tint" answer given when the fill-direction grammar was
chosen: there the tint was a solution looking for a problem, here it is what
makes a second list colour readable. The run being filled is deliberately left
unwashed — it is the default case, and washing both would make every selection
light up two runs.

The five states are therefore: **black** fits the run you are filling · **amber**
fits the crossing run · **grey** cannot go here · **grey struck** already on the
board · **red** placed more than once · **blue** currently held.

### F17 — Colour by *dimension*, and make the two hues provably equal

F16 marked only the crossing run, leaving the run being filled unwashed on the
grounds that it was "the default case". Owner-found: that reads as an arbitrary
asymmetry — one run lights up with no explanation of why *that* one, and the
clues for the other have nothing to point at. Both runs through the selected
cell are now marked. Three decisions came out of fixing it:

**The hue means the dimension, not "active vs crossing".** Tying it to the run
being filled would swap every colour on screen each time the fill direction is
toggled. Blue is horizontal and amber is vertical, always, on the board *and* in
the clue list — so a washed run and a clue written in the same colour are saying
the same thing, and the list needs no legend. Where a clue fits both runs the
fill direction breaks the tie, since that is where a click sends it.

**The two hues are exact mirrors, so neither shouts louder.** The first pair was
built ad hoc and the amber carried ~20% more chroma than the blue, which read as
the vertical run mattering more (owner-found). They are now the same shift
applied to the red channel for one and the blue channel for the other, green held
equal: identical chroma (0.232) and identical mean brightness (0.728) by
construction, verified numerically rather than by eye. The inks are built the
same way (chroma 0.620, mean 0.300). Blue/amber is also the pair that survives
the common forms of colour blindness best, which matters when the hue *is* the
information.

**Held became a shape, not a hue.** With both dimensions spending a colour, a
third accent for "currently held" would have competed with them — and a held clue
still belongs to a dimension, so it wants to keep that colour. It is boxed
instead.

**Two preferences, not one** (owner-requested). `fit-highlight` colours the clue
list; `highlight-runs` washes the board. Some players want to know which clues
are live without the grid being tinted, and the reverse. Holding a clue previews
it regardless of both — that is an explicit action, and without board feedback
there would be nothing to act on.
