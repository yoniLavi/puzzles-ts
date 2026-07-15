# Design — Net TS port

## D1. The undo-equality risk is a phantom — verified, and corrected in the register

`AGENTS.md` lists, under long-tail risks, "Undo via state-string equality … Net's rotation
cycles is the canonical hard case." **It is wrong, and it is the second false Net entry in
that register** (the supersede one was already corrected).

Verified for this design:

- `net.c` contains **zero** `strcmp` and **zero** `memcmp`.
- Across the entire `puzzles/*.c` tree, the *only* `memcmp` is config-keyword parsing in
  `midend.c`; every `strcmp` is env-var reads, CLI flags, or move-string parsing. **No game
  detects "did this move change anything" by stringifying and comparing state.**

What Net actually does — no-op suppression, entirely local and decidable in `interpretMove`:

- Click outside the grid, or in the inter-tile gutter → return `null`.
- Rotate on a `LOCKED` tile → return `null` (net.c:2353).
- Everything else returns a move; `execute_move` unconditionally builds a fresh state and the
  midend pushes it with no equality test.

The "rotation cycle" worry examined and dismissed:

- A *full cross* (`0x0F`) is rotation-invariant — but the generator never produces one (it
  removes a tile's fourth arm when a T forms, with a proof comment). Blank tiles likewise
  never occur.
- A *straight* tile is invariant under 180° (`f`). Upstream ships this: the tile visibly spins
  through the rotate animation, so it is not a visual no-op, and an identical-state undo entry
  is harmless (undo simply steps back through it).
- `A` then `C` returns to the original — two correct undo entries.

**So Net needs no state comparison, no `Object.is`, no engine change.** `interpretMove`
returns `null` / `UI_UPDATE` / `Move` exactly as Galaxies does. This change deletes the false
parenthetical from `AGENTS.md` so it stops haunting future ports.

## D2. Reuse: model-level yes, pixel-level no

Netslide is Net's sliding cousin and shares Net's *model*. But netslide's TS renderer descends
from an **old** net.c; Net's current `draw_tile` is a modern rewrite (thick scalable wires as
rotated polygons vs netslide's fixed 1px offset lines). They differ in wire primitive,
thickness model, rotation, palette, error colour, and border geometry.

**Extract (pure, no pixels) into a shared wire module:**

- Direction algebra — `R/U/L/D = 1/2/4/8`, `A`/`C`/`F`/`ROT`, `X`/`Y`, `COUNT`, `offset()`
  with wrapping. **Trap: bit 0x10 collides** — netslide uses it for `FLASHING`, Net for
  `LOCKED`. The shared module must define only the wire bits (0x0F) and leave the high bits to
  each game.
- The hex wire desc codec with `v`/`h` barrier markers — identical format.
- The spanning-tree grower (`xyd` + `xyd_cmp` over a sorted set, cross-avoidance,
  loop-avoidance) and the barrier-selection phase. Netslide already does this over
  `engine/sorted-multiset.ts`.
- `compute_active` (BFS from the source).

**Do NOT extract a shared renderer.** Unifying the two pixel algorithms would mean re-porting
netslide's drawing and regressing its accepted snapshots. Port Net's `draw_tile`/`draw_wires`
fresh (~280 lines); its packed 32-bit cache word already satisfies playbook §3.2 by
construction (every overlay bit — including a future `HINT_*` — lives in that word).

**Netslide is edited by this change** to consume the shared module. That refactor is
**behaviour-preserving**: netslide's committed render snapshots and its differential MUST stay
byte-identical, or the extraction is wrong and does not ship. This is the same discipline the
`unify-hint-framework` and `generalize-overlay-sidecar` extractions held to.

Promote `engine/sorted-multiset.ts` per its own docstring ("promote when a second game needs
it") — Net is that second game. (It currently lives in `engine/`; the promotion is
docstring-and-location housekeeping, not an API change.)

## D3. No supersede — the public desc is fixed at generation

Verified: `set_public_desc` is `NULL` for Net (net.c:3331). The wire grid is decided at
`new_game_desc` and never changes; the player rotates tiles, which are `state.tiles`, not the
desc. Restart rebuilds from the same desc. This is `history[0] === newState(params, desc)`,
the ordinary case — the `descSuperseded` branch in the midend is Mines' alone.

## D4. Determinism: jumble's RNG lives on the Ui, but the recorded move is expanded

Jumble (`j`) rotates every unlocked tile by a random amount, using a `random_state` **on the
Ui**, seeded fresh from entropy and **not serialised**. Determinism is preserved because the
*expanded* move string — `J;A1,2;C3,4;…`, one explicit rotation per tile — is what
`executeMove` records and the move log replays. The TS `Ui` carries the RNG; `interpretMove`
expands the jumble into an explicit `Move` list. This is the established pattern (the recorded
move is deterministic even though the thing that produced it was not); see how a hint plan's
executed moves are recorded.

Origin shift (`org_x/org_y`) and the source square (`cx/cy`) are Ui transforms, not state.
Both are serialised into the Ui string upstream and must survive a save.

## D5. Wrapping is re-derived, and `validateParams` forbids a degenerate case

`new_game` forces `wrapping` back to `false` if params say wrapping but every border edge
carries a barrier (net.c:1712) — this disables origin-shifting for a grid that is effectively
bounded. Easy to miss; port it. `validateParams` rejects `unique && wrapping && (w==2 ||
h==2)` (a 40-line proof upstream explains why it is unsolvable).

## D6. Generator order is RNG-load-bearing (the netslide lesson, again)

`new_game_desc` order is: spanning tree → record `aux` (the solved grid) → **uniqueness gate**
(`net_solver` + `perturb` loop, only when `unique`; regenerate the whole grid if perturbation
stalls) → shuffle (per-tile random rotation, then a loop-elimination inner loop, then require
≥1 mismatched non-wrapping edge) → barriers (after the shuffle, superset policy) → desc. Every
`random_upto` must fire in that order and count, exactly as netslide's design D6 established.
Byte-match differential records desc **and** `aux`.

## D7. `net_solver` and `perturb` — the hard half

`net_solver` (~380 lines) returns inconsistent / ambiguous / unique, tracking surviving tile
orientations, edge states, dead-ends, a todo FIFO with a marked bitmap, and a **`Dsf`**
(`engine/dsf.ts`) of equivalence classes for loop avoidance. `perturb` (~287 lines) rewires an
ambiguous region while preserving the spanning-tree property. These are the port's risk; a
byte-match differential on `unique` presets is the guard that they are faithful.

`compute_loops` uses `findloop` (`engine/findloop.ts`, whose `Iterable<number>`-per-vertex API
is a clean fit for the C stateful-iterator callback), gated by the `unlocked-loops` pref.

## D8. Input and geometry

Buttons (drag-rotate excluded, D-nongoal): left = rotate anticlockwise (`A`), right = rotate
clockwise (`C`), middle / `s` = toggle lock (`L`), `f` = 180° (`F`), `j` = jumble, arrows =
cursor, Ctrl+arrow = move source, Shift+arrow = move origin (wrapping only). Move grammar:
`;`-separated `A|C|F|L` + `x,y`, with `J`/`S` prefixes (both `noanim`; `S` sets `usedSolve`).

`NARROW_BORDERS` makes Net's window offset **zero** — no gutter at all (contrast netslide,
which keeps `3·ts/4+1` for its slide arrows). `computeSize` = `ts·w + LINE_THICK` square-ish.

**One upstream bug to fix, not port:** `game_get_cursor_location` (net.c:3160) does not apply
`org_x/org_y`, so on a shifted wrapping grid it reports the wrong on-screen-keyboard rect.
Harmless upstream; this fork diverges by design, so apply the origin — a one-line fix, noted so
it is a decision and not an accident.

## D9. Animation and flash

Rotation animates over `ROTATE_TIME` (0.13s) when `lastRotateDir != 0` (set per move on the
state; `J`/`S` suppress it); redraw renders the *old* state during the animation and repaints
any `ROTATING` tile every frame even at an unchanged cache word (playbook §3.2 — the rotating
tile is a per-frame overlay). Completion flash is a Chebyshev-distance ripple from the source
that XORs the `LOCKED` bit frame-by-frame (Net reuses the locked-grey background; it has no
separate flash colour), suppressed when `usedSolve`.

## D10. Not in scope

Printing (no print path). Drag-to-rotate (`USE_DRAGGING`, stylus-only). `game_request_keys`
is NULL. No text format. The `SMALL_SCREEN` 13×11 presets (not defined for web).
