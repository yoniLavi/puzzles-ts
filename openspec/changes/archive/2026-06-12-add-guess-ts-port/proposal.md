# Proposal: Port Guess to TypeScript

**Status**: Owner-accepted 2026-06-12 — `TS_PORTED` flipped, `guess.c` +
`guess-trace.c` deleted, archived. (The unified `hint()` follow-up named in
"Out of scope" was declined by the owner — Guess keeps the upstream `'h'`-key
working-row fill only.)

## Why

Migration-order item 7 ("outward, simplest-first") continues. Eight games are
TS-ported (Flip, Galaxies, Pegs, Sixteen, Cube, Fifteen, Twiddle, Flood).
**Guess** (Mastermind) is the next simplest-first pick: at ~1580 lines it is the
smallest remaining game, and it is a **fresh mechanic family** — a
deduction/feedback game with *no grid, no solver, and no generator constraints*
(the secret is a random colour sequence). That broadens coverage cheaply and
exercises three things no ported game has combined:

- a **non-grid layout** (a colour bar + rows of guess pegs + feedback markers +
  a hidden solution row), the first port whose geometry is not a `w×h` tiling;
- a **drag-a-sprite UI** built on the blitter — Pegs established the blitter
  drag pattern, and Guess reuses it to drag colour pegs from the bar into guess
  slots and back out;
- an **obfuscated-bitmap game description** — the secret is stored as a
  SHA-1-masked, hex-encoded bitmap (`obfuscate_bitmap` + `bin2hex`/`hex2bin`
  from `misc.c`). We already have a bit-identical SHA-1 (`random/sha1.ts`), so
  porting the obfuscation makes Guess game IDs byte-identical to the C build —
  the cleanest possible differential check (desc equality, no solver needed).

Guess also ships a **lexicographically-first-consistent-guess hint**
(`compute_hint`) that fills the working row — a real feature we reproduce.

## What Changes

- Add `src/native/games/guess/` implementing
  `Game<GuessParams, GuessState, GuessMove, GuessUi, GuessDrawState>`: guess a
  hidden combination of `npegs` pegs drawn from `ncolours` colours within
  `nguesses` rows; each submitted row is marked with Knuth's
  black-peg/white-peg feedback (`mark_pegs`); win on all-correct-place, lose
  when the rows run out (the solution is then revealed).
- Port the **desc codec** faithfully: `obfuscate_bitmap` + `bin2hex`/`hex2bin`
  as a local `guess/obfuscate.ts` (promotion candidate when a second game needs
  it), reusing `random/sha1.ts` (extended with a `shaCopy` for the `final =
  base` incremental-hash pattern). Game IDs stay byte-identical to C.
- Port `mark_pegs` (Knuth's `nc_colour = Σ min(#guess, #solution) − nc_place`
  feedback formula) and `is_markable` (a row is submittable when enough pegs are
  filled and the no-duplicates rule, if active, holds).
- Faithful **input**: drag a colour from the bar / from a current-row peg / from
  a past-guess peg onto a current-row slot (blitter sprite); right-click a slot
  to toggle its **hold** (carry to next guess); keyboard cursor (colour picker +
  peg picker), number keys, delete, hold (`CURSOR_SELECT2`), and submit; the
  `'h'`/`'H'`/`'?'` **hint** key runs `compute_hint` and fills the working row.
- The live editing state (working row, holds, drag, cursor, labels, cached hint)
  lives in `GuessUi`, mirroring upstream's `game_ui`; `GuessState` holds only the
  submitted guesses (+ feedback), the solution, `nextGo`, and `solved`.
- Register in the TS registry + `TS_PORTED_PUZZLE_IDS`; parity-gated.
- Add a `guess` branch to `worker-adapter.ts` `decodeCustomParams` (mapping
  `ncolours`/`npegs`/`nguesses`/`allowBlank`/`allowMultiple` to the type-summary
  config keys) — every ported game with non-`w`/`h` params needs this branch
  (Flood discovered it).
- On owner acceptance: `TS_PORTED` in CMake + delete `puzzles/guess.c`; archive.

## Out of scope

- **No `findMistakes`.** A guess row is never individually "wrong" — every
  submission is legal and gets feedback; the failure mode is exhausting the rows
  (the lose status), not a flaggable mistake.
- **No unified `hint()` plan hook (app-shell Hint button).** Upstream's hint is
  a *fill-the-working-row* suggestion driven by the `'h'` key, not a board
  overlay; we reproduce that behaviour faithfully (a `UiUpdate`, design D4). A
  separate later change can additionally expose it through the cross-game
  `hint()` system with its own rendering — deferred to avoid custom hint
  rendering and protect parity.
- **No animation/flash.** Upstream `game_anim_length`/`game_flash_length` both
  return 0; the only "flash" colour is the static markable-row indicator.
- **No `set_public_desc`/print support** (print deleted at fork; `set_public_desc`
  is `NULL` upstream).

## Impact

- **Affected specs:** new `guess` capability **+ a small `ts-engine` addition**:
  an optional `Game.changedState(ui, oldState, newState)` hook (upstream
  `game_changed_state`), called by the midend after every real
  move/undo/redo/solve/restart and at new-game setup (with `oldState = null`),
  **not** on a bare `UI_UPDATE`. Guess is the **first** port to need it — all
  eight prior ports had an empty upstream `changed_state`, so the midend never
  had the slot. Guess's body reconstructs the working row from the current
  state's holds on every transition (including undo/redo), which cannot be folded
  into `interpretMove` (undo/redo produce no move to hang it on). The hook is a
  faithful, reusable primitive — 41/41 upstream games carry the slot.
- **Affected code:** new `src/native/games/guess/`; the `changedState` hook in
  `src/native/engine/game.ts` + its invocations in `src/native/engine/midend.ts`;
  one `shaCopy` export added to
  `src/native/random/sha1.ts`; one import line in `src/native/games/index.ts`;
  one entry in `ts-ported-ids.ts`; a `guess` branch in
  `src/native/engine/worker-adapter.ts` `decodeCustomParams`; one transient
  harness `puzzles/auxiliary/guess-trace.c` + its `CMakeLists.txt` line + the
  frozen fixture; (on owner acceptance) `TS_PORTED` in `puzzles/CMakeLists.txt` +
  deletion of `puzzles/guess.c` and `guess-trace.c`.
