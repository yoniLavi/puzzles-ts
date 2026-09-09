# Tasks

## 1. Palisade narration review

- [x] Thread the region size `k` into `explain()` so it can state the bound.
- [x] Rewrite `cluesVersusRegionSize` in two arms: the general counting bound
      (`8 - a - b > k`) and the exact-size `3`/`3` case, each stating its own
      premise.
- [x] Read the other five rules' narrations as a set. `notTooBig` and
      `notTooSmall` said "the target size" and "too small" where they carry
      their evidence cells and can state the real numbers; both now do.
      `numberExhausted`, `noDanglingEdges` and `equivalentEdges` already carried
      their premises and changed only punctuation.
- [x] Re-run Palisade's hint and render-scenario tests.

## 2. The collection-wide sweep

- [x] Rewrite all 141 em-dash narrations across the 26 game files, game by game.
      Preserve the arc and the modal; never delete a clause to shorten.
- [x] Five more in the **engine**, which the game-directory scan could not see:
      `latin-hint.ts` (×2), `candidate-hint.ts`, `hint-refusal.ts` (×2). Found
      by the runtime sweep, not the source scan — see §3.
- [x] One internal `midend.ts` throw message, so the engine scan needs no
      carve-out for shipped code.
- [x] Leave Dominosa's `3–5` en-dash labels alone (verified: still 3 hits).
- [x] Update the per-game tests asserting narration text (8 files, 15 cases),
      including two that keyed *on the dash itself* — Crossing split its
      sentence on `" — "` and Inertia asserted a lowercase `"undo"` that a
      sentence break capitalized.
- [x] Verify by **shape**: every removed line in the 26-file diff contains an
      em-dash and no added line does; the only nine exceptions are Palisade's
      deliberate restructure.

## 3. The guard

- [x] Add the em-dash rule to `src/engine/hint-quality.test.ts`, iterating the
      derived `HINT_GAMES` like the rules beside it.
- [x] **Decision: three overlapping nets, not one.** A runtime sweep sees only
      the arms that fire — Palisade's `cluesVersusRegionSize` counting arm never
      fired across twelve seeds of all four presets — so it cannot be the whole
      guard. A source scan over `games/**` is complete for game-authored text
      but blind to the narration the engine writes on a family's behalf, which
      is how the first cut passed its own scan and was caught by the runtime
      sweep. So: runtime sweep + game-source scan + engine-source scan.
- [x] Exclude `engine/testing/` structurally, not by filename roster.
- [x] **Proved it fails**: planted an em-dash in Palisade and in
      `hint-refusal.ts`; all three nets went red, each naming its exact line;
      restored.
- [x] Carry vacuity counts (`SCANNED_SOURCE_FILES`, `SCANNED_ENGINE_FILES`,
      `HINT_GAMES.length`).

## 4. Record

- [x] `docs/games/hints.md` § "No em-dashes", plus the two places the guides
      quoted a Palisade narration that changed (`AGENTS.md`, `hints.md` §"The
      quality bar").
- [x] `ts-engine` spec delta.
- [x] Run the app and read hints on a real board. Palisade 5×5 shows the exact
      hint the question was about, with both clue cells outlined and the forced
      edge in hint blue. Solo is where the composited frame earned its keep: the
      shared cleanup step's comma trailed a list ("row, column or block, the
      same cleanup…") and read as another list item, so that one became a
      parenthetical.
