# Design — add-mathrax-ts-port

## Context

Mathrax (© 2019 Lennard Sprong, from the x-sheep/puzzles-unreleased collection) is a
**Latin-square logic puzzle with a unique solution**. Fill an `o×o` grid with digits
`1..o` — no repeat in any row or column — subject to clues sitting on the `(o-1)×(o-1)`
interior grid intersections. A clue constrains the four cells diagonally around it
(`topleft`, `topright`, `botleft`, `botright`): an arithmetic clue means the operation
gives the **same result on both diagonal pairs** (`topleft ○ botright == topright ○
botleft`) and shows that result; `=` means the diagonal pair is equal; `E` / `O` mean
all four are even / odd. The source is `puzzles/unreleased/mathrax.c` (~1801 lines),
already a `latin.h` consumer, so this is a textbook Latin-family port
([playbook §2.2](../../docs/porting/game-port-playbook.md)).

It is an **ordinary catalog game with a working C/WASM fallback** — *not* an
`unfinished`/`PUZZLES_ENABLE_UNFINISHED` game. So the standard two-stage parity gate
applies in full: stage 1 registers it TS-served while the C stays behind it as the
fallback; stage 2 (owner-accepted) flips `TS_PORTED` and deletes the C.

**Long-tail risk checklist ([playbook §1](../../docs/porting/game-port-playbook.md)) —
clean.** `set_public_desc` is `NULL` and the desc never changes mid-play, so **no
`supersededDesc`**. No-op moves are suppressed *locally* in `interpret_move` (the
"digit already there" early return), so **no state-string undo**. There are **no
`#ifdef EDITOR` move letters**. `game_print` exists in the C, but `printing.c` was
deleted at fork, so the port **promises no print path**. `is_timed` is `false` (the
`game_timing_state` returning `true` is inert with the timer off), so **not a timed
game** — no `isTimed`/`timingState`.

## Decisions

### D1 — Params and the desc/game-ID codec

`MathraxParams { o, diff, options }` — `o` the grid size, `diff` one of
`Easy | Normal | Tricky | Recursive`, `options` a bitmask of the six enabled clue
types (`Add | Sub | Mul | Div | Eql | Odd`, value `OPTIONSMASK = 63`).

- **`encodeParams(p, full)`**: `"%d"` of `o`; when `full`, append `"d"` + the
  difficulty char (`e`/`n`/`t`/`r`) and — **only when `options != OPTIONSMASK`** — the
  enabled-clue letters in the fixed order `A S M D E O`. `decodeParams` reverses it and
  restores `options = OPTIONSMASK` when none are named (an empty set means "all"),
  faithfully to `decode_params`.
- **`validateParams`** in upstream order: `o ≥ 3` → `o ≤ 9` → `diff` known → (on
  `full`) at least one clue type enabled.
- **`paramConfig`** (Custom dialog, [playbook §3.4](../../docs/porting/game-port-playbook.md)):
  a `Size` string item (numeric `set` via `parseConfigInt`), a `Difficulty` choices
  item, and **six boolean items** (`Addition clues` … `Even/odd clues`). Keys match
  the C `game_configure` slugs (`Size`→`size`, `Difficulty`→`difficulty`,
  `Addition clues`→`addition-clues`, …). `describeParams` emits `size` + `difficulty`
  (the numeric level index) for the type-menu summary — and this change adds the
  matching `mathrax` template to `src/puzzle/augmentation.ts`, since the generic
  `{width,height}` base does not fit a square + difficulty game (else the header shows
  a literal `{field}`, guarded by `augmentation.test.ts`).

**Desc codec** — two comma-separated run-length parts, ported as exact inverses
(`new_game_desc` ⇄ `load_game`/`validate_desc`), a byte-match surface:

1. **Grid givens** over `o*o` cells, left-to-right, top-to-bottom: a digit `1..o` is
   its own character `'1'..'9'`; a run of empty cells is a single letter `'a'..'z'`
   (run length 1–26, splitting at 26). This part MAY be entirely empty (all runs).
2. `,` then **clues** over `(o-1)*(o-1)` intersections: `A<n>` / `S<n>` / `M<n>` /
   `D<n>` for add/sub/mul/div (with `S0` = equality `=`), `E` / `O` for even/odd, and
   `'a'..'z'` for runs of empty intersections.

`validateDesc` reproduces `load_game`'s checks (via a load-and-discard): reject an
overlong grid part, an out-of-range digit (`> o`), an unknown character, a clue number
`> 99`, an unknown clue letter, and a short (`0 < pos < size`) grid or clue part.

### D2 — Solver: a `latin.ts` consumer (its own clue deductions + a thin driver)

Per [playbook §2.2](../../docs/porting/game-port-playbook.md), Mathrax's `solver.ts`
is **its own clue logic plus a thin difficulty driver over `latinSolver`** — the cube,
positional/numeric elimination and the guess-and-verify recursion all come from
`engine/latin.ts`.

- **The clue deduction** is `mathraxOptions(o, clue, oppositeMarks, simple)` (upstream
  `mathrax_options`): given a clue and the candidate bitmask of the *opposite* cell
  across the intersection, return the set of digits that can sit in this cell. Arithmetic
  clues enumerate `(a,b)` pairs satisfying the operation; `E`/`O` return the fixed
  even/odd masks; `=` is `Sub` with number 0. The user-solver
  (`mathrax_solver_apply_options`) syncs its per-cell mark array with the latin cube,
  intersects each cell's marks with `mathraxOptions` across its (up to four) adjacent
  clues, and writes eliminations back into the cube; a wiped cell returns `IMPOSSIBLE`.
- **The difficulty ladder** maps onto latin's `cfg` and the same `apply_options` body
  with two gates: `Easy` (`simple = true`) only reads a clue when the opposite cell is
  *confirmed* (single bit); `Easy`+`Normal` only commit an elimination that
  **immediately confirms a single digit**; `Tricky` propagates fully. `Recursive` is
  latin's own guess-and-verify recursion (the `DIFF_RECURSIVE` level;
  `usersolvers = {easy, normal, tricky, NULL, NULL}`). `valid` is a constant `true`
  (Latin uniqueness is enough). The numeric `DIFF_IMPOSSIBLE/AMBIGUOUS/UNFINISHED`
  sentinels come from `latin.ts`.

Follow §2.2's index-space caution: read cube slices via the framework's accessors
where it reads cleanly, but keep any dense flat read verbatim rather than re-deriving
it (byte-match surface).

### D3 — Generator: `latinGenerate` + solver-gated clue stripping (byte-match portable)

`new_game_desc` is a faithful port and byte-match portable — its only RNG draws are
`latinGenerate(o, rs)` and two `shuffle`s:

1. `latinGenerate(o, rs)` a full solution square.
2. For every interior intersection, compute a *candidate clue* from the four
   surrounding solution digits via `mathraxCandidateClue(a1,b1,a2,b2,options)` — port
   its **exact precedence** (`Add`, then `Sub` for a positive difference, then equality
   as `Sub 0`, then `Mul`, then `Div` with ratio ≠ 1, then all-odd `Odd`, then all-even
   `Evn`) and its `a≥b` normalisation, since the chosen clue decides the desc.
3. `mathraxStripGridClues` — shuffle the `o*o` cells, and for each still-present given,
   tentatively clear it and **keep the removal while the puzzle still solves at the
   target difficulty**.
4. `mathraxStripMathClues` — shuffle the `(o-1)*(o-1)` intersections and strip clues on
   the same "keep-while-solvable" rule.

**Two quirks to reproduce verbatim** (solver-gated ⇒ [playbook §4.4](../../docs/porting/game-port-playbook.md)):
the strip loops treat `mathraxSolve` returning **any non-zero** (including `2` =
ambiguous) as "still remove it" — do not tighten to "uniquely solvable." And the
generator gates only at `maxdiff = diff` with maximal stripping; it does **not** reject
a puzzle that turns out solvable at a *lower* difficulty than requested. That is the
difficulty curve upstream shipped ([playbook §4](../../docs/porting/game-port-playbook.md)
rule 3), not a defect — matching it is what keeps the differential byte-exact.

### D4 — Input and move model: Solo-style, a discriminated union

Mathrax "uses the same control scheme as Solo." Model the move as a discriminated
union (repo convention), not upstream's `"R…"/"P…"/"S…"/"M"` strings:

```ts
type MathraxMove =
  | { kind: "set"; x: number; y: number; digit: number | null }    // R: place / clear
  | { kind: "pencil"; x: number; y: number; digit: number | null } // P: toggle mark / clear all
  | { kind: "markAll" }                                             // M
  | { kind: "solve"; digits: ReadonlyArray<number> };              // S
```

`interpretMove` builds these directly, all cursor/selection state on the ephemeral
`Ui` (`hx, hy, cshow, ckey, cpencil`), never on the state:

- **Left-click** selects a cell for ink (toggles selection off on a re-click; never
  selects an immutable given). **Right-click** selects for pencil. Arrow keys move the
  cursor (`gridCursorMove`); `CURSOR_SELECT` (Enter) toggles pencil mode.
- Digits `'1'..'9'` (bare — `MOD_NUM_KEYPAD` never arrives,
  [§3.8a](../../docs/porting/game-port-playbook.md), and the game binds nothing else to
  them) enter a value; `'\b'`/space/`'0'` clear. In pencil mode a digit toggles that
  mark bit; a placed cell can't take a mark.
- **No-op suppression is local**: re-entering the digit already in a cell returns
  `null` (keyboard) or a bare `UI_UPDATE` (mouse) — the local predicate, never
  state-string comparison ([playbook §1](../../docs/porting/game-port-playbook.md)).

**Right button is load-bearing** (upstream sets `REQUIRE_RBUTTON`) — it is pencil
select — so, unlike Inertia ([§3.8c](../../docs/porting/game-port-playbook.md)), the
port **must not** fold right onto left; a touch long-press correctly arrives as the
pencil gesture. `MOD_STYLUS` stripping is automatic
([§3.8b](../../docs/porting/game-port-playbook.md)); the touch-input guard covers the
port on registration.

### D5 — Pencil-mark note-taking UX (the four §3.7 elements) + on-screen keypad

Mathrax is a pencil-mark game, so it ships the full note-taking UX
([playbook §3.7](../../docs/porting/game-port-playbook.md)), all default-on divergences:

- **Mark-all** — `canMarkAll: true` surfaces the toolbar button; the `M`/`m` handler
  fills every empty cell with all candidates. Mathrax has row/column uniqueness
  regions, so route it through `adaptiveMarkAllMove(grid, pencil, o, regionsOf)`
  (`engine/candidate-hint.ts`, `regionsOf` = the cell's row + column) so a second press
  strikes obvious candidates — *not* plain fill-only.
- **Sticky pencil mode** — a `pencilSticky` `Ui` boolean (default true) via the `prefs`
  hook, unifying the mouse with the already-persistent keyboard mode.
- **A mode indicator** — a small pencil glyph while pencil mode is on (a high tile-flag
  bit on a cache-safe cell, or an explicit repaint region), so the mode is always
  visible.
- **Notes are first-class in `findMistakes`** — see D6.

**On-screen keypad** ([§3.8](../../docs/porting/game-port-playbook.md)): implement
`requestKeys(params) → digitKeys(o)` — buttons `'1'..'o'` plus the `Clear` key.
`o ≤ 9`, so `digitKeys` needs no letter rollover and fits exactly upstream's
`game_request_keys` (n digits + backspace). Without this the TS path ships an empty
keypad, breaking touch digit entry.

### D6 — `findMistakes`: against the unique solution, notes first-class

A uniquely-solvable Latin puzzle **must** ship `findMistakes` — Check & Save depends on
it ([playbook §3.5](../../docs/porting/game-port-playbook.md)). `findMistakes(state)`
re-solves from the immutable givens + clues to the unique solution
(`mathraxSolve(..., Recursive)`), then flags:

- a **placed digit** that differs from the solution — `kind: "cell"`;
- an **empty cell whose non-empty pencil notes have crossed out** the cell's unique
  solution value — `kind: "note"` ([§3.7](../../docs/porting/game-port-playbook.md));
  a note carrying merely *extra* candidates is ordinary mid-solve state and is not
  flagged. Derive the solution from placed givens/entries only, never from the notes.

Both render as the same red overlay via an `OverlaySidecar` folded into the diff key
([§3.2](../../docs/porting/game-port-playbook.md) — the overlay must be in the cache
key or it won't repaint on the Check frame). Returns `[]` when the board is not
uniquely deducible.

**Relationship to upstream's live error highlighting.** `mathrax_validate_game`
already computes *immediate-contradiction* flags (`FE_COUNT` for a row/column
duplicate, `FE_TOPLEFT/…/BOTRIGHT` for a violated clue) that render red **during
play**, independent of Check. This is a distinct, useful behaviour — it answers "is
this board self-contradictory *now*," where `findMistakes` answers "does this
contradict the *unique solution*." Port the live-contradiction rendering faithfully
**and** add `findMistakes` for the save gate; they can share the `COL_ERROR` /
`COL_ERRORBG` palette entries.

### D7 — Rendering: palette in C enum order, narrow border, per-tile cache

- **Palette** index-for-index with the C enum
  ([§3.3](../../docs/porting/game-port-playbook.md)): `BACKGROUND, HIGHLIGHT, LOWLIGHT`
  (from `mkhighlight`), `BORDER` (black), `GUESS` (green player digit), `PENCIL`
  (teal), `ERROR` (red), `ERRORBG`. Derive from the app background; the app owns
  dark-mode adaptation ([§3.3](../../docs/porting/game-port-playbook.md)).
- **Geometry**: `NARROW_BORDERS` is defined for the web build, so port the
  `BORDER = 1` arm (**not** `tilesize/2`), and `computeSize = o*tilesize + 2*BORDER`
  ([§3.2](../../docs/porting/game-port-playbook.md), checked not assumed).
- **`redraw`**: per-tile cache keyed on an `Int32Array` packing the digit, the mark
  bitmask (`o ≤ 9` bits), and the cursor/pencil/flash flags
  ([§3.2](../../docs/porting/game-port-playbook.md)); the clue circles drawn at the
  four incident intersections; the pencil-mark mini-grid; the minus/times/divide glyphs
  via a text fallback. Completion **flash** over `FLASH_TIME = 0.7 s` (the `(x+y) % 3`
  three-phase wave). No slide animation (`game_anim_length` is `0`). Every overlay
  (error, mistake, cursor) in the diff key.

### D8 — Differential: byte-match, the strongest bar here

Because the generator is solver-gated over the bit-identical `random.ts`, a single
byte-match assertion validates `latinGenerate`'s draws, the two shuffles, every solver
verdict, and the codec at once ([playbook §4.3/§4.4](../../docs/porting/game-port-playbook.md)).

- **`puzzles/auxiliary/mathrax-trace.c`** on the established pattern — `#include
  "../unreleased/mathrax.c"` to reach the `static` generator/solver, print each seed's
  desc (and recorded difficulty) as JSON; add one `cliprogram(mathrax-trace
  mathrax-trace.c)` line (it links `common`, which carries `latin.c`/`tree234.c`).
  Build pure-C ([§4.2 gotcha](../../docs/porting/game-port-playbook.md): reconfigure
  with `-DUSE_TS_RANDOM=0`).
- **`mathrax-differential.test.ts`** (gated, committed): assert `newDesc(p,
  randomNew(seed)).desc === fixture.desc` across the fixture matrix, via
  `describeDescDifferential`, with a follow-on `validateDesc` check. Fixture matrix:
  the nine presets plus a sweep over size (3..9), each difficulty, and a couple of
  restricted `options` subsets.
- An advisory `scripts/diff-mathrax.test.ts` is optional and, if added, is deleted with
  the C at stage 2 ([§4.1](../../docs/porting/game-port-playbook.md)).

### D9 — Stage-2 catalog mechanics

Mathrax already ships as a catalog C/WASM game, so stage 1 is a plain
register-and-serve with the C as fallback. Stage 2, **only on owner acceptance**: add
`TS_PORTED` to the `puzzle(mathrax …)` entry in `puzzles/unreleased/CMakeLists.txt`
(the entry stays in `unreleased`; only the flag is added), delete
`puzzles/unreleased/mathrax.c` and the trace harness, `rm -rf build/wasm/` and rebuild
so no `mathrax.wasm` is emitted, then archive the change with the deletion.

## Risks

- **Solver-gated byte-match is strict** — the TS solver must reach C's *exact* verdict
  (including the ambiguous-counts-as-solved strip quirk, D3) on every intermediate
  board, or the desc diverges. This is the intended verification, not a hazard, but
  budget a differential-debugging cycle ([§4.7](../../docs/porting/game-port-playbook.md))
  if a variant mismatches.
- **`latin.ts` reuse is proven** across five games, so the solver framework is
  low-risk; the game-specific surface is the clue-options enumeration and the two strip
  loops.
- **Small, self-contained, no leaf beyond `latin.ts`** — among the lower-risk ports.

## Open questions

None blocking. An explained candidate-elimination hint (Towers-grade) is a compelling
follow-up, deliberately out of scope for this change.
