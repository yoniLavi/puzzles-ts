# Tasks — add-mines-ts-port

## 1. Scaffold + state/codec/desc

- [ ] 1.1 `scripts/new-game-port.sh mines`; `state.ts`: params (`w`, `h`, `n`, `unique`,
      optional forced first click `X`/`Y`), encode/decode/validate (incl. the `%`
      percentage-of-area custom form and `unique ⇒ w>2 && h>2 && n ≤ wh−9`), the grid value
      encoding (`0..8` open, `-1` flag, `-2` covered, `64` revealed mine, `65` the mine that
      killed you, `66` wrong flag), the `MineLayout` shared box (D1), and the three desc
      forms (D2): preliminary `r<n>,<u|a>,<hex rs>`, public `<x>,<y>m<hex>`, private
      `m<hex>`.
- [ ] 1.2 `validateDesc` for all three forms (bitmap length exactly `(wh+3)/4` nibbles;
      optional `m`/`u`; optional `x,y` prefix), reusing `engine/obfuscate.ts`
      (`obfuscateBitmap`/`bin2hex`/`hex2bin`) and `randomStateEncode`/`randomStateDecode`.
- [ ] 1.3 Tier-1 tests: params + all three desc forms round-trip; a public desc opens its
      first click at `newState`; a private desc does not.

## 2. Solver (`minesolve`)

- [ ] 2.1 `solver.ts`: the 3×3 `set` store ordered by `setcmp = (y, x, mask)` over
      `engine/sorted-multiset.ts` (D6.3 — the perturb target is picked by in-order index, so
      the ordering is load-bearing); `setmunge`; `known_squares`; the square-todo FIFO.
- [ ] 2.2 The deductions: trivial (all-mines / all-clear), pairwise wings, subset, and the
      global mine-count deduction incl. the 10-set disjoint-union search. Preserve
      `ss_overlap`'s scan order (D6.3).
- [ ] 2.3 Tier-1 tests: hand-built boards exercising each deduction; a board the solver
      must *stall* on (returns "stuck") — the guess-free gate depends on that verdict being
      right.

## 3. Generator (`minegen` + `mineperturb`) — byte-match-critical

- [ ] 3.1 `generator.ts`: uniform placement outside the 3×3 around the first click; the
      `unique` solve-and-perturb loop (accept only a no-perturbation solve; give up and
      re-place when the perturb count stops strictly decreasing); `allow_big_perturbs` after
      100 tries.
- [ ] 3.2 `mineperturb`: the preference-ordered candidate list (type / random bits / y / x —
      a total order, D6), the fill-or-empty walk, the partial-fill fallback, and the in-place
      patch of the solver's visible grid. **Port the double-increment livelock guard verbatim**
      (D6.2) with a comment saying it is upstream's typo and why we keep it.
- [ ] 3.3 **Burn the two discarded `random_upto` calls** in the interactive desc path (D6.1).
- [ ] 3.4 Tier-1 tests: every generated `unique` board is solvable by the solver with **no
      guessing**; mine count is exactly `n`; the 3×3 around the first click is always clear.

## 4. Game glue + the supersede hook (the point of the change)

- [ ] 4.1 `index.ts`: `newState`/`executeMove` (open with flood, flag, chord, solve; death;
      the win check that auto-flags the remainder), `interpretMove` (incl. the chord that
      peeks at the layout and emits only the mined squares — D7), `status` (**death is not a
      loss**; only solve-assisted wins report as such), `statusbarText`, `flashLength`
      (death vs win, none when solved), `textFormat`.
- [ ] 4.2 **`supersededDesc(state)`** (D2) — returns `null` until the layout exists, then the
      public + private descs. Record the first-click coords in the state on the first click
      *whether or not the layout was generated there*.
- [ ] 4.3 The `MineLayout` shared box (D1): created in `newState`, filled once, shared by
      clones. Comment the controlled impurity **at the mutation site**. Verify the engine's
      `executeMove`-purity guards: if one trips, **the guard is right** — write this game an
      explicit exemption, do not weaken it for the other 37.
- [ ] 4.4 `ui.deaths` + `ui.completed` survive a save (D7).
- [ ] 4.5 Tier-1 tests: undo past the first click and click elsewhere ⇒ the **same** layout
      (no reroll — D1's whole point); a save taken mid-game restores against the private desc
      and replays to the same board; restart lands *after* the first click; the game ID names
      the real board once superseded.

## 5. Timer — the unproven engine path (D3)

- [ ] 5.1 `isTimed: true` + `timingState`: clock stopped before the first click, running
      after it, stopped on death, on win, and once `completed` was ever set.
- [ ] 5.2 Tier-1 tests through a real `Midend` for each of those transitions.
- [ ] 5.3 **Browser verification is mandatory, not optional** — no TS game has ever driven
      the midend timer. Watch the clock actually tick, stop, and survive save/restore.

## 6. Render

- [ ] 6.1 `render.ts`: palette index-for-index with the C enum (classic Minesweeper number
      colours; `COL_BACKGROUND2` = 95% bg for open tiles); **`NARROW_BORDERS` geometry**
      (`BORDER = max(ts*3/20, 1)` — the web build, playbook §3.2); the one-time recessed
      bezel; flags, mines, the killing mine, wrong-flag crosses; the death/win flash.
- [ ] 6.2 The two **ui-derived** overlays — the "too many flags" wrong-number highlight and
      the mouse-down highlight radius — reach the render cache via the cache key or an
      `OverlaySidecar` (D8). A cold-frame test cannot catch a missing one: paint twice.
- [ ] 6.3 Tier-2.5 render-scenario tests + snapshots.

## 7. Differential

- [ ] 7.1 Transient `puzzles/auxiliary/mines-trace.c` (+ its `cliprogram` line), built pure-C
      (`-DUSE_TS_RANDOM=0`); record `(preset, seed, first-click) → layout bitmap` fixtures.
- [ ] 7.2 Gated `mines-differential.test.ts`: **byte-match** the layout bitmap for every
      fixture (D6). A mismatch means one of the three traps was missed — check them first.

## 8. Registration + gate (stage 1)

- [ ] 8.1 Register: `ts-ported-ids.ts` + `games/index.ts`. Icons already committed.
- [ ] 8.2 Full gate: `tsc -b --noEmit` → `biome lint` → `vitest run` → `vite build`;
      `openspec validate --strict`.
- [ ] 8.3 Dev-verify in the browser: first click never a mine; the clock (task 5.3); flagging;
      chording (and the mis-flagged chord revealing only the mine); death → undo → continue,
      with the death counter persisting; win; Solve on a dead board painting the corrections
      grid; the game menu offers a plain **Quick-save** (no Check & Save — D4); 0 console
      errors.

## 9. Owner acceptance → stage 2

- [ ] 9.1 Owner acceptance of full behavioural parity.
- [ ] 9.2 Flip `TS_PORTED`; delete `puzzles/mines.c` + `puzzles/auxiliary/mines-trace.c` (+ its
      CMake line); `rm -rf build/wasm/` and rebuild; mines in the catalog with no `mines.wasm`.
- [ ] 9.3 Dev guides updated with what this port taught. **Retire the supersede long-tail
      entry in `AGENTS.md`** — with a consumer, it is no longer a risk, it is a feature.
- [ ] 9.4 `openspec archive add-mines-ts-port` in the same commit as the C deletion.
