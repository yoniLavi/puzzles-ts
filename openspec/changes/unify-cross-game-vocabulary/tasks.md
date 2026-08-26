# Tasks — unify-cross-game-vocabulary

## 0. Before touching anything

- [ ] 0.1 **Check what the existing suites actually cover.** The cursor renames
      are behaviour-preserving by construction, so a green suite is only
      evidence where the suite presses an arrow key. Count the games whose tests
      exercise a cursor; for the rest, the shape check is the evidence and the
      task list must say so rather than implying coverage.
- [ ] 0.2 Re-measure the three populations rather than trusting this change's
      numbers — they were taken on 2026-08-26 and games move.

## 1. The cursor `Ui` contract (~42 games)

- [ ] 1.1 `GridCursor` + `newCursor`/`moveCursor`/`hideCursor` in
      `engine/pointer.ts`, per design D2. Keep it to the noun: no painting, no
      per-game verbs.
- [ ] 1.2 Convert two games first and *stop* — one plain (Slant), one that does
      something while moving (Tents). If the second one fights the helper, the
      helper is wrong; fix it before converting forty more.
- [ ] 1.3 Convert the rest, gate between batches, not at the end.
- [ ] 1.4 Renderers read the cursor through the same field; sweep `render.ts`
      alongside each game rather than after.
- [ ] 1.5 Leave the genuinely different traversals alone — half-grid (Palisade,
      Separate, via `border-grid.ts`), corner-skipping (Tracks), lock modes.
      They keep their own logic; only the *naming* is in scope.

## 2. The completion vocabulary (~14 games)

- [ ] 2.1 Rename to `completed` / `cheated` on `State` wherever a game spells
      them otherwise (`usedSolve`, `hasCheated`, `wasSolved`, `solved`,
      `complete`).
- [ ] 2.2 Adopt `winFlash` in every game whose `flashLength` then reduces to it
      — the eight verbatim copies plus whatever 2.1 unlocks.
- [ ] 2.3 Confirm the genuinely bespoke ones are untouched and say why in each:
      Samegame (also flashes "impossible"), Flood (won *and* lost), Ascent
      (duration scales with board size), Pegs (two frames), Mosaic, Palisade,
      Flip's solve celebration.
- [ ] 2.4 Check no per-game spec states a renamed flag normatively; if one does,
      it needs a delta.

## 3. The first-arrow-press unification (player-visible)

- [ ] 3.1 Find every game that reveals-only, and change it to reveal-and-move.
- [ ] 3.2 **Its own commit**, separable from §1 and §2, so it can be reverted
      alone.
- [ ] 3.3 Tier 2.5 on the games whose behaviour moves: the frame after one arrow
      press from a fresh board.
- [ ] 3.4 Owner acceptance — this is the one part a player can feel.

## 4. Guards against re-drift

- [ ] 4.1 Extend `emittable-keys.test.ts`'s derived approach: a game declaring
      its own cursor-visibility field, or its own spelling of `cheated`, fails.
      Derive the vocabulary from the engine, never a hand-written list.
- [ ] 4.2 Prove each guard fails before trusting it.
- [ ] 4.3 Vacuity: assert how many games were looked at.

## 5. Verify the bulk edit by shape

- [ ] 5.1 `scripts/check-rename-shape.mjs`, plus the manual "every changed line
      is one of these kinds, now read the exceptions" grep. A green suite is not
      the check for a mechanical sweep this wide.
- [ ] 5.2 For the pure renames, assert the stronger property: every line removed
      appears verbatim at the destination modulo the rename.

## 6. Docs and specs

- [ ] 6.1 `ts-engine`: ADDED requirements for the cursor `Ui` contract and the
      completion vocabulary.
- [ ] 6.2 `docs/games/input.md` and `engine-catalog.md`: the interim "match the
      nearest neighbour" note becomes the settled rule.
- [ ] 6.3 `docs/games/rendering.md`: the `winFlash` section loses its interim
      framing once §2 lands.
- [ ] 6.4 `docs/framework-rdd/game-definition.md`: move what shipped out of the
      survey and into the real guides, per the fiction-quarantine rule.
- [ ] 6.5 `openspec validate unify-cross-game-vocabulary --strict`.
