# Design — add-lightup-ts-port

## D1: Reuse the pre-pivot `src/native/combi/` module as-is

The combi enumerator was ported byte-faithfully pre-pivot
(`port-combi-to-typescript`) with its own corpus test, and Light Up is its
only consumer. The port imports `Combi` from `src/native/combi/` rather than
re-porting it game-locally or relocating it into `engine/`. Relocation would
churn a verified module for zero behaviour gain; if a second consumer ever
appears the promotion decision can happen then. The stale corpus-era `combi`
spec stays untouched — it accurately describes the module that exists.

## D2: Byte-match differential (playbook §4.3/§4.4)

`new_game_desc` is deterministic given the seed: one `shuffle` of numindices,
`set_blacks` (rejection-sampled placement + optional centre draw), `place_lights`
(one shuffle + deterministic sweep), solver-gated number stripping, and a
deterministic blackpc ramp on failure. No `qsort`, no wall clock. So the TS port
must reproduce the C desc byte-for-byte for the same seed, and the differential
asserts that via `describeDescDifferential` across all 10 presets plus a
non-default symmetry/blackpc param set.

Byte-match here is solver-gated twice over (§4.4): `puzzle_is_good` decides both
which candidate grids are accepted **and** which numbers strip, and the
difficulty check runs the solver at `difficulty-1` to reject too-easy boards.
The TS solver must therefore replicate C's exact deductive power, including:

- the `F_NUMBERUSED` bookkeeping (only numbers the solver *used* survive the
  first strip);
- `discount_set`'s "best square" choice (minimum rule-out count, first-wins on
  ties) — it determines which squares get `F_IMPOSSIBLE` and in what order;
- the `goto reduction_success` early exit — the set-discount pass restarts the
  cheap deduction loop after the **first** successful discount, not after
  sweeping the whole grid;
- `MAXRECURSE = 5` and the exact recursion bookkeeping (`-1` propagation under
  `FORCEUNIQUE`, solution-count summing).

## D3: Move/state model

Idiomatic per the playbook: `LightupState` holds `params`, an `Int32Array`
`lights` (bulb-count for open squares / clue value for numbered blacks), a
`Uint8Array` `flags` (F_BLACK/F_NUMBERED/F_IMPOSSIBLE/F_LIGHT — F_NUMBERUSED
and F_MARK live only inside solver/generator scratch copies), `nlights`,
`completed`, `usedSolve`. Moves are a discriminated union:
`{ type: "light", x, y }` (toggle bulb, clearing a mark),
`{ type: "impossible", x, y }` (toggle mark, clearing a bulb),
`{ type: "solve", ops }` (the C `S;L…;I…` compound — a list of toggles applied
atomically, setting `usedSolve`). `interpretMove` returns `null` for the C
`nullret` cases (toggle-light on a marked square, any action on black) so no
history entry is created — locally decidable, same stance as Galaxies.

`MOD_STYLUS` handling (left-click cycles through mark when the square is
already marked/lit) is **not** ported: the web frontend never sets
`MOD_STYLUS` (same skip as every prior port; upstream's own emcc frontend
doesn't send it either).

## D4: findMistakes semantics

Boards this fork generates are uniquely solvable at their stated difficulty.
`findMistakes(state)` re-solves a cleaned copy (clues only) with the full
solver (discount sets + recursion, the same flags upstream `solve_game` uses);
if that yields a unique solution, flag:

- `kind: "light"` — a player bulb on a square the solution leaves empty;
- `kind: "mark"` — an impossible-mark on a square the solution lights (a bulb
  *position*, not merely a lit corridor — marks assert "no bulb here", so only
  a mark sitting on a solution bulb is provably wrong).

Wrong entries render with a red `COL_ERROR` inset outline via a drawstate
sidecar included in the cache diff key (§3.2). If the board isn't uniquely
solvable (hand-typed desc), return `[]` — same degradation as Galaxies.

## D5: Rendering

Direct port of the C's per-tile model: `tile_flags` packs everything the tile
draw reads (black/numbered/lit/light/overlap/cursor/number-wrong/flash/
impossible) into one integer per cell, compared against the drawstate copy —
this *is* the playbook's `Int32Array` cache-key pattern, so the TS drawstate
keeps exactly that, plus a `wrong` sidecar for findMistakes (D4) in the diff
key. Palette stays index-for-index with the C enum (0 background, 1 grid,
2 black, 3 light, 4 lit, 5 error, 6 cursor) because `augmentation.ts` carries
dark-mode `paletteOverrides` for indices 2 and 3. The win flash is the C's
3-phase background blink (`flashtime*3/FLASH_TIME != 1`), no animation
(`anim_length` 0). The engine paints nothing; the `!ds.started` branch fills
the background and draws the outer grid outline.

## D6: Params UI

`describeParams` emits the exact keys the existing `augmentation.ts`
`describeConfig` template reads: `width`, `height`,
`percentage-of-black-squares`, `symmetry` (numeric choice index 0–4),
`difficulty` (numeric 0–2). `paramConfig` mirrors upstream `game_configure`:
width, height, %-black (string fields via `parseConfigInt`), symmetry and
difficulty (choices), validated by `validateParams` (incl. the "4-fold needs a
square grid" and blackpc 5–100 rules). Decode keeps upstream's lenient quirks:
bare `WxH` demotes ROT4 to ROT2 on non-square grids, and the legacy `r` flag
maps to difficulty 2.

## D7: Documented skips

- **No keypad** — upstream `game_request_keys` is NULL.
- **No `needsRightButton`** — upstream flags are `STYLUS_SUPPORT` only; the
  right button adds marks but the game is playable without it.
- **No printing** (deleted at fork), **no supersede**, **no editor letters**.
- **`current_key_label`** has no TS-engine surface (none of the 25 ports
  carry it); skipped as before.
