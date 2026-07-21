# Design — add-abcd-ts-port

## Context

ABCD is a `puzzles/unreleased/` third-party puzzle (Lennard Sprong, 2011) whose
docs mark it "fully implemented and playable" — and it is. The rules: fill each
cell of a `w×h` grid with one of `n` letters (`A`…), the numbers on each row/column
edge count how many of each letter that line holds, and identical letters may not
be orthogonally adjacent (and, in "no-diagonals" mode, not diagonally either). It
has a **unique solution** by construction — the generator only emits a puzzle whose
clues the deductive solver drives to a single grid — which makes ABCD a full logic
puzzle, not a movement game, with all that implies below.

The whole port turns on one fact from the C: the puzzle *state the player sees* is
just **the grid of entered letters plus pencil marks**, while the puzzle *data* is
**`(w+h)·n` edge clue numbers**. The solver reads the clue numbers and the grid;
the generator is a solver-gated retry loop; the codec serialises only the clue
numbers. Everything follows from that split.

**Long-tail risk checklist (playbook §1) — clean.** ABCD's `set_public_desc` is
`NULL` and it never supersedes its desc (`supersededDesc` not needed); it compares
no stringified state for undo — no-op entries are suppressed *locally* in
`interpret_move`/`execute_move` (returning `MOVE_NO_EFFECT`/`NULL`), which is the
whole technique; it has **no** `#ifdef EDITOR` move letters; and although it *does*
carry a real `game_print`, this fork deleted the print pipeline at fork time, so
the port makes **no print promise** (consistent with every prior port). None of the
long-tail traps bite.

## Decisions

### D1 — State: entered grid + pencil-mark cube + immutable clue numbers

Model the immutable `AbcdState` idiomatically:

- **`grid`** — `Int8Array` of `w·h`, each cell a letter index `0…n-1` or `EMPTY`
  (upstream's `127`; in TS use a named `EMPTY` sentinel or `-1`, chosen in
  implementation — it is never serialised in the desc).
- **`pencil`** — the per-cell candidate cube, upstream's `clues[w·h·n]` booleans.
  A `Uint8Array`/bitset of `w·h·n` (or `boolean[]`), cloned per `executeMove`. This
  is *pencil-mark UI state*, not solver scratch — the solver uses its own copy.
- **`numbers`** — the `(w+h)·n` edge clues, `NO_NUMBER` (`-1`) for a hidden one.
  **Immutable and shared by reference across states** (playbook §3.1 frozen-shared
  pattern): the clues never change after `newGame`, so every clone aliases the same
  frozen array.
- **`completed` / `cheated`** flags.

`cloneState` copies `grid` + `pencil` and aliases `numbers`. GC, no `dup`/`free`.

**Clue indexing** mirrors the C macros, kept as named helpers so a reader need not
re-derive them: `horClue(y,i) = i + y·n` for rows `y ∈ [0,h)`, and
`verClue(x,i) = horClue(x+h, i) = i + (x+h)·n` for columns `x ∈ [0,w)`. So the
`numbers` array is the `h·n` row clues followed by the `w·n` column clues, and the
cell candidate cube is `cuboid(x,y,i) = i + x·n + y·n·w`.

### D2 — Params and the codec, byte-match portable

**Params** `{ w, h, n, diag, removenums }`. Encoding (`encode_params`): `%dx%dn%d`,
then `D` if `diag`, then `R` if `removenums` (**only on the "full" encoding** —
`removenums` is a generation-time knob absent from a shared game ID, exactly like
other difficulty-only params). Decode reads `w`, optional `x h`, optional `n n`,
optional `D`, optional `R`.

**Validation** in upstream order and messages: `w ≥ 2`, `h ≥ 2`; then `n ≥ 3` for
normal mode but `n ≥ 5` for `diag` (fewer letters cannot avoid the no-touch rule);
then `n ≤ 9` (keypad / hotkey ceiling). The two `n` lower bounds are a genuine
gotcha — record them in `params.ts`.

**`paramConfig`** (playbook §3.4): Width, Height, Letters (numeric via
`parseConfigInt`), "Remove clues" (boolean → `removenums`), and **"Allow diagonal
touching"** (boolean → `diag = !bval` — the config exposes the *inverse* of the
stored flag; port that inversion faithfully or the checkbox reads backwards).

**Desc codec.** The description is a comma-terminated list of `(w+h)·n` clue
numbers in `numbers`-array order, a bare `-` for a hidden clue (each entry followed
by `,`). `new_game` parses digits→number, `-`→`NO_NUMBER`, skips commas.
`validate_desc` reproduces upstream's checks: each number must fit its axis
(`num ≤ 1 + w/2` for a row clue `i < h·n`, `num ≤ 1 + h/2` for a column clue),
and the total count must be **exactly** `(w+h)·n` — distinguishing "not enough
clues" from "too many". This is byte-match surface; port encode/decode as exact
inverses.

### D3 — The deductive solver: idiomatic three-valued result, no leaf lib, no backtracking

`abcd_solve_game` (`abcd.c:835`) is a fixpoint of three deduction techniques over a
working copy (a candidate cube + a `remaining[]` count per row/column-letter):

1. **Satisfied / exhausted clue** — when a row or column already holds its required
   count of a letter (`remaining == 0`), rule that letter out of every empty cell
   in that line.
2. **Single possibility** — a cell with exactly one surviving candidate is that
   letter; place it (via `placeLetter`, which rules the letter out of the placed
   cell's other candidates *and* its neighbours, orthogonal always, diagonal too
   under `diag`).
3. **Runs** (`abcd_solver_runs`, `abcd.c:593`) — within a line, partition the empty
   cells where a letter is still a candidate into maximal runs; the most copies a
   run of length `L` can hold without two touching is `⌈L/2⌉`. If the summed maximum
   over a line's runs **equals** the still-required count, every odd-length run is
   forced to place the letter on its even offsets — place them.

The loop reruns the two cheap techniques whenever either fires before trying runs
again (upstream's `if (busy) continue;`), then finishes by classifying the grid:
**`SOLVED`** (0), **`AMBIGUOUS`/incomplete** (a cell with a contradiction-free but
non-unique fill, upstream `+1`), or **`CONTRADICTION`** (a cell with zero remaining
candidates, or a clue over/under-satisfied, upstream `-1`). Port these as a
discriminated result, not magic `-1/0/1` (the Galaxies precedent).

**No leaf dependency** — `solver(abcd)` in `CMakeLists.txt` names none, and the
survey confirms it: no `latin`/`dsf`/`matching`/`tree234`/`grid`/`findloop`. It is
self-contained arithmetic over the candidate cube. Do **not** reach for
`engine/latin.ts` — ABCD's constraint is a per-line *count* with a no-touch rule,
not a Latin-square permutation. (The one deliberate weakness upstream ships: there
are **no diagonal-specific deduction techniques** — the runs technique ignores
diagonal adjacency. This is a weaker-than-ideal solver, i.e. the difficulty curve
upstream shipped, playbook rule 3 — not a defect to fix. It still generates valid
diag puzzles because `placeLetter` accounts for diagonal neighbours.)

### D4 — Generator: solver-gated retry + greedy clue removal, byte-match portable

`new_game_desc` (`abcd.c:1024`) is a pure function of the seed and reproduces
byte-for-byte:

1. **Random fill.** Left-to-right, top-to-bottom, place a uniformly random letter
   drawn from the cell's still-legal candidates (a single `random_upto` per cell;
   `placeLetter` keeps the partial grid no-touch-legal). Every cell always has at
   least one candidate, so the fill never dead-ends.
2. **Count clues** from the finished grid into `numbers`.
3. **Gate.** Run the solver on those clues from blank; accept the puzzle only if it
   returns `SOLVED` (unique). Otherwise discard and retry from step 1.
4. **Remove clues** (only when `removenums`): shuffle the `(w+h)·n` clue indices
   once, then walk them, tentatively setting each to `NO_NUMBER` and keeping the
   removal only if the solver still returns `SOLVED`, else restoring it.

The RNG surface is exactly `random_upto` per fill cell plus, for hard mode, one
`shuffle` of the index array — `solve` is deterministic. So the desc is a pure
function of the seed and the byte-match differential (D6) validates the generator,
the solver's every verdict, and the codec together.

**Aux.** Upstream stashes the solved letters in `aux` for the Solve button, but the
solver re-derives the unique solution from the clues alone, so the TS port needs no
`aux` threading (playbook §3.6) — `solve()` just re-runs `solveGame`.

**Cost note (a real risk, not a defect).** Upstream's own TODO: even×even large
grids can take *tens of thousands* of attempts (a valid 10×10 n4 was never found;
9×9 n4 can take tens of thousands). The differential (D6) must budget time and pick
fixtures accordingly (smaller/odd sizes, bounded attempts) — this is inherent to
the shipped generator, not a port regression, and there is **no difficulty knob** to
add.

### D5 — `findMistakes`: ship it (unique solution), re-solve and flag contradictions

ABCD is a unique-solution logic puzzle, so per the logic-puzzle rule it **ships
`findMistakes`** (playbook §3.5). Implementation: run the deductive solver on the
puzzle's clues from blank to obtain the **canonical solution grid** (it exists and
is unique by construction), then flag every cell where the player has entered a
letter that differs from the canonical one. That is the "wrong-but-legal state the
unique solution contradicts" the Check-&-Save hard-block wants.

Keep this distinct from ABCD's **always-on error rendering**, which is *base
render*, not the hook: `abcd_count_clues` reds a clue that is over-crowded or can no
longer be met, and `abcd_set_errors_adjacent` reds a letter with an identical
orthogonal (or, under `diag`, diagonal) neighbour. Those live-rule-violation
highlights are part of `redraw` and are ported regardless of `findMistakes`. The
two are complementary: the live highlights catch *rule* breaches immediately; the
hook catches *any* entry that diverges from the unique answer, including ones that
break no local rule yet.

### D6 — Differential: byte-match on desc across presets + a size sweep

Follow the established pattern (`puzzles/auxiliary/abcd-trace.c` + a
`cliprogram()` line, dumping the generated desc per seed): the TS `newDesc`
**reproduces the C description byte-for-byte** for every fixture. Because the
generator is solver-gated at every accept/reject and every clue-removal decision,
one byte-match assertion validates the generator's fill order, the solver's every
deduction and verdict, and the codec — the strongest check available, exactly as
for other solver-gated ports (playbook §4 intro).

Fixture matrix: the shipped presets plus a modest size sweep, chosen to keep
generation fast (D4 cost note) — prefer odd sizes and the smaller even ones, and
include at least one `removenums` (hard) and, if it generates in reasonable time,
one `diag` configuration, so the shuffle path and the diagonal `placeLetter` path
are both exercised. Budget the trace's time; do not assume sub-second generation.

### D7 — Input: Solo-style entry as a `Move` discriminated union

ABCD's input is Solo's (its docs say so). Model the move as a discriminated union,
not upstream's `R…`/`P…`/`M`/`S` move strings:

```ts
type AbcdMove =
  | { kind: "enter"; x: number; y: number; letter: number | null } // R; null clears
  | { kind: "pencil"; x: number; y: number; letter: number }       // P: toggle mark
  | { kind: "markAll" }                                             // M: fill all marks
  | { kind: "solve"; grid: ReadonlyArray<number> };                // S
```

`interpretMove` builds these on an **ephemeral `Ui`** (cursor `hx,hy`, `hpencil`,
`hshow`, `hcursor` — never serialised, mirrors `game_ui`):

- **Left-click** a cell selects it for ink (toggling selection off on a repeat);
  **right-click** selects it for pencil (but not over a filled cell); both emit a
  `UI_UPDATE`, converting the pointer with the shared `fromCoord`.
- **Arrow keys** move the cursor (`UI_UPDATE`); **Enter/CURSOR_SELECT** toggles
  ink/pencil.
- With a cell selected, a **letter key** (`A`–`I` / `a`–`i` / `1`–`9`, each
  clamped to `< n`) emits `enter`/`pencil`; **Backspace / Space / `0`** emits
  `enter` with `letter: null`. In pencil mode a filled cell rejects the key
  (`MOVE_NO_EFFECT`). **Bare digits `1`–`9` must be accepted** for letters — this
  frontend never sets `MOD_NUM_KEYPAD` (playbook §3.8a), and the C already binds
  them, so this is faithful, not a divergence.
- **`M`/`m`** emits `markAll` when any empty cell is missing a candidate mark.

`executeMove`: `enter` sets the grid cell (and, when clearing, wipes that cell's
pencil cube — upstream `memset`); `pencil` toggles one candidate; `markAll` sets
every empty cell's whole candidate cube true; `solve` overwrites the grid from the
canonical solution and sets `completed`+`cheated`. After an `enter`, recompute
`completed` via the win check (D8). Undo/redo is entirely the midend's — ABCD keeps
no special undo state (do **not** reach for state-string equality; §1 checklist).

### D8 — Win condition: `validate_puzzle` returns "solved"

Completion is upstream's `abcd_validate_puzzle` returning `0`: no clue over- or
under-satisfied, no adjacency violation (orthogonal, plus both diagonals under
`diag`), and **every** cell filled. Port it as a `boolean` win check called after
each `enter`; set `completed` (and never clear it once set, matching the C).

### D9 — Rendering: Solo-style grid, live error colour, completion flash, `BORDER = 0`

Port `game_redraw` idiomatically with a per-tile `Int32Array` cache key (playbook
§3.2) packing the cell letter, the cursor/pencil flags, the error-flag mask, and
the flash phase; grid geometry and colours are display-scope (playbook §3.3), so
match the *look*, not pixels, and let the app own dark-mode adaptation.

- **Border letters** (`A`…) drawn once in the top-left gutter; **edge clues**
  drawn on the top and left borders, red when the clue's error flag is set.
- **Cells**: a bevelled tile, the entered letter (red on an adjacency-error flag,
  else the guess colour), or the pencil-mark grid when empty; the cursor tile
  highlighted; a small corner cross in each cell under `diag` mode as the
  no-diagonals visual cue.
- **Completion flash**: a diagonal-stripe animation over `FLASH_TIME = 0.7 s` in
  `FLASH_FRAME = 0.1 s` steps (`flash = ⌊flashtime / FLASH_FRAME⌋ mod 3`, tiles lit
  by `(x+y) mod 3`), fired only on a genuine (non-cheated) completion. There is **no
  move animation** (`game_anim_length` is `0`).

**Border geometry**: `webapp.cmake` defines `NARROW_BORDERS`, so the compiled arm
is `BORDER_START = BORDER_END = 0` (checked, not assumed — both arms are in the
source). `computeSize` is `(w+n)·TILESIZE + 1` wide (the `+1` is upstream's
`NARROW_BORDERS` tile-background allowance) by `(h+n)·TILESIZE` tall;
`fromCoord(px) = ⌊px / TILESIZE⌋ − n`, `innerCoord(x) = (x+n)·TILESIZE`. Ship a
tier-2.5 render-scenario test + snapshot for a selected-cursor frame, a pencil-mark
frame, an adjacency-error frame, and a completion-flash frame.

### D10 — No statusbar

`wants_statusbar` is `false` upstream — ABCD shows no move counter or status line.
Nothing to wire; simpler than a movement port.

## Risks

- **Generator time on even×even large grids (D4).** Inherent to the shipped
  algorithm, not a port bug and not fixable without changing every board (playbook
  rule 3). Manage it in the differential fixture choice and by budgeting the trace;
  do not add a difficulty knob.
- **The runs technique is fiddly (D3).** Off-by-one in run boundaries or the
  `⌈L/2⌉` maximum silently weakens or breaks the solver, which the generator gate
  would then paper over — the byte-match differential (D6) is the guard, since a
  wrong solver verdict changes which boards are accepted and so changes the desc.
- **Two-`n`-lower-bound validation and the inverted diagonal config (D2)** are easy
  to get subtly wrong; both are called out to port verbatim.
- **Stage 2 deletes one file** (`abcd.c`) and flips one CMake entry — small — but is
  still gated on owner acceptance per the parity gate.

## Open questions for the owner

1. **Presets to ship (D2).** Upstream offers seven presets — `4×4`/`5×5` in Easy
   and Hard, `6×6` Easy, and `7×7` in 3- and 4-letter Easy — all non-diagonal.
   Default to porting all seven; the owner may trim (e.g. drop the slow `7×7 n4`).
2. **Whether a `diag` configuration joins the differential fixtures (D6)**, given
   its generation cost — default yes if it generates in reasonable time, else cover
   `diag` by a tier-1 solvability test only.
