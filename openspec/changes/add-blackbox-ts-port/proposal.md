# Proposal: Port Black Box to TypeScript

**Status**: Proposed

## Context

Ten games are now TS-ported and owner-accepted (Flip, Galaxies, Pegs, Sixteen,
Cube, Fifteen, Flood, Twiddle, Guess, Samegame), with Samegame's owner
acceptance pending. The porting pattern — `Game` impl in
`src/native/games/<id>/`, runtime registry, parity-gated registration, per-game
C deletion on owner acceptance — is well-trodden. Migration-order item 7
("outward, simplest-first") is the active phase. **Black Box** is the next
genuinely-simplest port.

## Why Black Box

- **Simplest-tier remaining** (`blackbox.c` ~1597 lines). It has **no
  uniqueness solver and no difficulty grading**: `new_game_desc` just scatters
  `nballs` balls at random arena cells, and `solve_game` returns the canonical
  reveal (a give-up). The only `solver`-shaped logic is `check_guesses`, which
  *verifies* a guess by firing every laser against the real layout and the
  player's guessed layout and comparing — deduction display, not generation.
  Its sole leaf dependency is `puzzles.h`; it needs no `grid`/`latin`/`tree234`.
- **The substance is laser ray-tracing**, not generator/solver search: a beam
  enters the firing range, reflects off ball-adjacent cells (instant-reflection
  and instant-hit edge rules at the entry cell), and either hits a ball,
  reflects back out, or exits elsewhere; matched entry/exit pairs share a
  number. This is self-contained, fully deterministic, and exactly the kind of
  logic that ports cleanly to idiomatic TS with strong behavioural tests
  (hand-verified beam cases) standing in for a corpus.
- **It reuses an already-ported helper.** Black Box obfuscates its ball-layout
  desc with the same `obfuscate_bitmap` + `bin2hex`/`hex2bin` Guess ported. By
  the established second-consumer rule (`SortedMultiset`, `Dsf`), this change
  **promotes `obfuscate.ts` to `src/native/engine/`** and points both Guess and
  Black Box at it.
- **It exercises the `"lost"` game status.** Revealing with wrong/missed balls
  is a loss-reveal (`game_status` returns −1), the first port to map `status` to
  `"lost"` for a wrong endgame — a small, useful widening of the established
  status mapping.

## Scope

- Port `puzzles/blackbox.c` to `src/native/games/blackbox/`:
  - **`state.ts`** — `BlackboxParams` (`w`, `h`, `minballs`, `maxballs`) with
    the 5 upstream presets, lenient `decodeParams` (`w`/`h`/`m`/`M`), `a-b`
    range parsing in `custom`/validate, and `validateParams`; the obfuscated
    desc codec (`newDesc`/`validateDesc`/`newState`); the laser engine
    (`range2grid`, `grid2range`, `isball`, `fireLaserInternal`, `laserExit`,
    `fireLaser`); `checkGuesses(state, cagey)` (both the cagey single-error
    feedback path with its deterministic grid-seeded `random_state` and the
    full reveal path); `cloneState`; `status`.
  - **`index.ts`** — the `Game` object, `newUi`, `changedState` (the error
    counter increment on a `justwrong` move), `interpretMove` (toggle ball,
    toggle lock, column/row lock, fire laser with the press-to-highlight flash,
    reveal button, keyboard cursor + select/select2), `executeMove` (the `T`/
    `F`/`R`/`LB`/`LC`/`LR`/`S` moves as a discriminated union), `statusbarText`,
    and `solve`.
  - **`render.ts`** — `colours`, `computeSize`, `setTileSize`, `newDrawState`,
    `redraw` (arena tiles with cover/lock/ball/reveal states and the
    wrong-guess red cross; laser range tiles with hit/reflect/number text,
    wrong/omitted markers, and the press-flash highlight; the bevelled grid
    outline; the reveal button), `animLength`, `flashLength`.
- **Promote `src/native/games/guess/obfuscate.ts` to
  `src/native/engine/obfuscate.ts`** and repoint Guess's imports and its
  `obfuscate.test.ts`. Pure code move; covered by the existing test.
- Behavioural tests (laser physics on hand-verified layouts, `checkGuesses`
  correct/wrong/missed counting, desc obfuscation round-trip, params
  round-trip/validation) and a tier-2 render-ops test.
- Register in the TS registry (`index.ts` barrel) and add `blackbox` to
  `TS_PORTED_PUZZLE_IDS`.
- On **owner-accepted** parity (rendering + input, not a green suite alone): add
  `TS_PORTED` to the CMake catalog and delete `puzzles/blackbox.c`. Until then,
  the empty-registry fallback keeps the C build serving Black Box.

## Out of scope

- **No `hint()`.** Black Box has no human solver to narrate; deduction is the
  player's job. Omitted (as for the permutation games), recoverable later.
- **No `findMistakes()`.** A Black Box position has no "mistake" notion before
  the reveal — any ball placement is a legal hypothesis, and the cagey verify
  step *is* the game's own mistake feedback. `findMistakes` is correctly absent
  and Check-&-Save degrades to plain Quick-save.
- **No persisted error counter.** Upstream's `encode_ui`/`decode_ui` only
  preserve `ui.errors` (the "(N errors)" status suffix) across a save. The TS
  engine has no Ui-serialisation hook, so the counter is session-only and
  resets on reload — a minor, documented cosmetic divergence. The counter still
  works within a session.
- **No byte-identical board corpus.** The generator is a `random_upto` scatter
  over the already bit-identical `random.ts` with no uniqueness loop to stress;
  the differential check is advisory/deferred (Cube/Fifteen precedent), with
  behavioural laser-physics tests carrying the correctness weight.
- **No print support** (deleted at fork; a cross-game concern).

## Impact

- **Affected specs:** new `blackbox` capability.
- **Affected code:** new `src/native/games/blackbox/`; move
  `guess/obfuscate.ts` → `engine/obfuscate.ts` with Guess's imports repointed;
  one import line in `src/native/games/index.ts`; one entry in
  `ts-ported-ids.ts`; (on owner acceptance) `TS_PORTED` in
  `puzzles/CMakeLists.txt` and deletion of `puzzles/blackbox.c`.
