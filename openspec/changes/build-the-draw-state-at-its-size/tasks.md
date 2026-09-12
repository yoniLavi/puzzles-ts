# Build the draw state at its size

## 1. Re-take the measurements before building on them

- [ ] 1.1 Re-read every game's `setTileSize` body (all 56; Ascent's is
      `setAscentTileSize`) and classify: bare assignment / derived geometry /
      rounding / invalidation. `proposal.md` says 42 / 6 / 1 / 9 as of
      2026-09-12; a count in prose is a claim. Verify by the script printing
      the bodies, and record the re-taken figures here.
- [ ] 1.2 List every call site of `newDrawState(` and `setTileSize` outside the
      game definitions, keyed on the call shape and not on a helper name
      (`sizedDrawState` is one route; a test writing both calls by hand is
      another). Record the count; it is the vacuity check for section 4.
- [ ] 1.3 Re-read `src/puzzle/components/view.ts` `resize()` and
      `worker-adapter.ts` `resizeDrawing`, and confirm design D2's premise still
      holds: the canvas is resized, and `canvasCleared` called, whenever the
      board's pixel size changes. If it no longer does, stop and revise D2.
- [ ] 1.4 Read `fix-flip-canvas-reshape` (archive, 2026-05-20) for what the
      flicker actually was, and confirm D2 keeps that fix: repeated same-size
      `size()` calls must still leave the draw state alone.

## 2. Contract and midend

- [ ] 2.1 `Game.newDrawState(s, tileSize)`; delete `Game.setTileSize` and its
      doc comment in `src/engine/game.ts`. Verify: `npm run typecheck` fails in
      exactly the games and tests section 1.2 listed, and nowhere else.
- [ ] 2.2 `Midend.freshDrawState` passes `currentTileSize`; `size()` rebuilds
      the draw state iff the resolved tile size differs (D2); `canvasCleared`
      and `startFrom` unchanged beyond that. Update the `size()` doc comment on
      the `Midend` interface, which currently says "No other side effect on the
      drawstate".
- [ ] 2.3 `fakeGame`: take the tile size in `newDrawState`, drop
      `setSizeCalls`. In `midend.test.ts`'s "`Midend.size` is purely
      informational" suite, keep the same-size tests verbatim and turn "does NOT
      recreate the drawstate even when called with a different size" and the
      `size({400})` half of "a redraw after only size() preserves the per-tile
      cache" into their opposites. **Prove each rewritten test fails** against a
      `size()` that does not rebuild, then restore.

## 3. The games

- [ ] 3.1 Move each game's sizing into `newDrawState` and delete its
      `setTileSize`, in batches the typechecker holds together. The 42 bare
      assignments become a `tileSize` in the literal; derived geometry (Blackbox,
      Lightup, Samegame, Spokes, Cube, Ascent) is computed there; Bricks stores
      `evenTs(tileSize)` — read its `computeSize` first.
- [ ] 3.2 `newBorderGridDrawState(w, h, tileSize)` for Palisade and Separate.
- [ ] 3.3 Delete the nine invalidations (Bridges, Flip, Galaxies, Pegs,
      Signpost, Rome, Guess; Inertia's and Spokes' blitter drops) rather than
      moving them — a fresh draw state has nothing to invalidate. Read each first:
      if one resets something a fresh literal would *not* reset, it is a finding,
      not a deletion.
- [ ] 3.4 Cube's `gridScale` and Guess's `pegsz` → `tileSize` (D4). Guess's
      derived geometry fields stay.
- [ ] 3.5 **Verify by shape.** `grep` for `setTileSize` across `src/` returns
      nothing but the midend's history-free prose, if any; every
      `newDrawState` definition takes two parameters (key on the definition
      shape — `function newDrawState`, `newDrawState: (`, and a method — not on
      one spelling).

## 4. Harness and tests

- [ ] 4.1 Update every call site from 1.2 and confirm the count matches.
      Decide `sizedDrawState` per D5 (delete, or keep only for the
      preferred-size default and say so).
- [ ] 4.2 `capability-surface.test.ts`: read `newDrawState(state, preferred)`,
      delete "loses nothing by reading the draw state before it is sized", keep
      the vacuity test. Rewrite `enrollment.ts`'s `drawState` doc comment, which
      is all about the unsized hazard.
- [ ] 4.3 `cursor-vocabulary.test.ts` writes `ds["tileSize"]` into a draw state
      by hand; build it at the size instead.

## 5. Proof it moved nothing a player sees

- [ ] 5.1 **No render snapshot moves.** Every tier-2.5 frame is reached through a
      real `Midend`, so a re-baselined render snapshot means a game's draw state
      is not what it was. Run the render tests *without* `-u` (and note that
      `vitest run -u <path>` swallows the path — see `git status '*.snap'`).
- [ ] 5.2 The capability snapshot moves only for Cube (`gridScale` → `tileSize`)
      and Guess (`pegsz` → `tileSize`), and for the fake game if it is in it.
      Compare as parsed field sets, not as text — a renamed key re-sorts.
- [ ] 5.3 Run the app (Chrome, `playwright-cli`): resize the window across
      several tile sizes on a cached-tile game (Galaxies), a blitter game
      (Inertia or Spokes) and a derived-geometry game (Blackbox), and confirm no
      stale or mixed-size tiles and no flicker on a same-size layout jiggle
      (mobile-width viewport, toggle a panel).

## 6. Docs and close

- [ ] 6.1 `docs/games/rendering.md`: the `setTileSize` paragraph, the tile-size
      convention paragraph (and its false Cube/Guess sentence), and the Bricks
      `setTileSize` mention. `docs/games/mechanics.md`: the `setTileSize`
      mentions (declared-by-all-57, `interpretMove` sizing, `sizedDrawState`,
      Bricks). `docs/games/testing.md`: the "Read the draw state *unsized*"
      limit. Grep `docs/` and `AGENTS.md` for `setTileSize`, `sized`, `unsized`.
- [ ] 6.2 Re-read the `ts-engine` delta against the code as built — it was
      written before implementation, and a delta is a claim about code that was
      still moving (`AGENTS.md` § "Method"). **Decide the capability-snapshot
      requirement's shape while doing so**: its scenario "a game assigns a
      draw-state field only once its tile size is known" was kept by name and
      restated only because `validate` refuses a `MODIFIED` block that drops a
      scenario, and its heading now names a case the contract makes impossible.
      The honest retirement is `REMOVED` plus an `ADDED` requirement under a new
      name (`AGENTS.md` § "Work management", on retiring a scenario). Then the
      full gate, and archive.
