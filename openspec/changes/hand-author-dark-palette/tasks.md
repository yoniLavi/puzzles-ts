# Tasks — hand-author-dark-palette

> Light mode is the regression surface (design D5): every committed render snapshot is
> a light-mode frame, so a moved snapshot is a defect in this change until proven
> otherwise. Never re-baseline one to make the suite pass.
>
> Run only the test files relevant to each step; the full suite runs once, at commit.

## 1. Classify the roles before authoring anything

- [x] 1.1–1.3 **Scope cut on the owner's "keep it simple" steer, and it was the right
      call** (design F3). Classifying all 119 `INK`/`PAPER` uses from their enum names
      would have been 119 judgement calls, mostly mine, about a distinction only
      visible in dark mode. Instead **only the eight colours in five games where
      `augmentation.ts` already recorded the answer** moved — each with a comment
      naming it. `flood` (a line, not a piece) and `unruly` (derived bevel trios) were
      deliberately left; both keep their per-game override.

## 2. Harvest the dark values that already exist

- [x] 2.1 Harvested: 31 `paletteOverrides` across 19 games — 19 of them landing on a
      role (10 `INK`, 5 `PAPER`, 4 the mkhighlight trio), plus 16 `paletteSwaps` of
      which 9 are a pure highlight/lowlight pair.
- [x] 2.2 **The harvest's real finding was that almost none of it is role-wide.** The
      absolute values (`lightup {2: [0.5,0,0], 3: [0.95,0,0]}`, `bricks`, `mines`) are
      per-game judgements about *that board*, not statements about a role — Light Up
      lifts its black because a pure-black wall vanishes on a dark board, which is
      true of Light Up and not of Pearl. The one decision that recurred across games
      with the same meaning was "a piece keeps its black/white" (15 entries, 7 games),
      and that is the one that became a role. Authoring dark values for the rest would
      have been inventing rather than harvesting.
- [x] 2.3 Eight entries deleted (§5.4); the rest stay, correctly, as per-game
      statements.

## 3. The fallback calculation

- [x] 3.1 In `src/utils/color.ts`, make chromatic colours preserve their relationship
      to the background (invert, then Hunt boost + neon clamp) — design D4.
- [x] 3.2 Unit-test the five representative cases in D4's table, so the ordering
      (fills recede, text advances) is pinned rather than eyeballed.
      → `src/utils/color.test.ts`, 8 property-style tests (not value snapshots), incl.
      the one that would have caught the original defect: same lightness in must give
      the same lightness out whatever the chroma.
- [x] 3.3 Re-run the ΔL diagnostic: 150 violations across 45 games must go to ~0.
      Anything left is a real finding — investigate, don't relax the threshold.
      → **150 → 2**, both `unruly` indices already marked `false` in `augmentation.ts`
      (the white tile + bevel). Design F1.

## 4. Roles gain dark values, and the two conflated roles split

- [x] 4.1 Roles carry a scheme decision where there is evidence for one. **Only one
      role-wide authored decision had real evidence** — "a piece keeps its black/white"
      — so only that was authored; every other role keeps §3's now-correct calculation.
      Authoring values nobody had asked for would have been inventing, not harvesting.
- [x] 4.2 Split `PIECE_BLACK`/`PIECE_WHITE` out of `INK`/`PAPER` (design D3/F3).
- [x] 4.3 `palette.test.ts`: a role's identity is now **(value, scheme behaviour)** —
      `INK` and `PIECE_BLACK` are the same black and are not duplicates, because they
      diverge in dark mode. Plus a test that the engine reports a game's decisions by
      palette index (pearl → `[3, 4]`).

## 5. Plumbing: the engine states its decisions in the app's own vocabulary

- [x] 5.1 Role constants carry their scheme decision on the colour itself, staying
      structurally `Colour`, so no game's `colours()` signature changes (design D1).
- [x] 5.2 `Midend.darkModeOverrides(bg)` reads the tags off the resolved palette and
      returns `Record<number, false>` — **the same shape `augmentation.ts` already
      uses** — so the tag never has to survive structured clone and the frontend
      learns no new concept (design F3). Threaded through `EngineCore`,
      `TsWorkerPuzzle`, `PuzzleEngineSurface`, `WorkerPuzzle` (C returns `{}`) and
      `Puzzle`.
- [x] 5.3 `puzzle-view.ts` changes by one line: the per-puzzle override falls back to
      the palette's own. Per-puzzle still wins, so Light Up keeps *lifting* its black.
- [x] 5.4 Deleted the eight override entries the roles replace, plus two `darkMode`
      blocks left empty.

## 6. Verify

- [x] 6.1 Light mode unmoved: **no render snapshot changed in either stage.** Stage 1
      by construction (`darkModeColor` only runs in dark mode); stage 2 because the
      eight moved colours keep their light values exactly.
- [x] 6.2 Dark mode in Chrome across the spread: **Slide** (the reported bug — target
      zone now recedes as a dark green floor tint), **ABCD** (coloured text, now bright
      and legible — the pole the old rule got backwards), **Pearl** and **Pattern**
      (piece black/white, correct with their overrides deleted), **Flood** (large
      fills — measured better, see F2), **Solo**. 0 console errors.
- [x] 6.3 Full gate green on both stage commits; change validates strict.
- [x] 6.4 Playbook §3.3 now tells a new port to reach for `PIECE_BLACK`/`PIECE_WHITE`
      when the colour is the piece's identity rather than ink, explains that the
      difference only shows in dark mode (which is why it gets missed), and notes the
      Light Up escape hatch. The "a game never adapts for dark mode" rule is unchanged.
- [ ] 6.5 Owner acceptance, then archive.

## Deliberately not done

- **Hand-authored dark values for the enumerated identity sets** (design D6/F2).
  Flood's and Guess's ten-colour sets lose about half their mutual separation in dark
  mode (0.134 → 0.070), and no background-relative rule can fix that, because "tell
  these apart from each other" is a property of the set rather than of any one colour.
  Stage 1 nearly tripled the worst pair (0.025 → 0.070), so this is better than it was
  and no longer urgent; finishing it is genuine per-game design work. Flood and Guess
  are where the evidence says to start. Signpost's 70 arrow colours are a computed
  ramp and would want a dark *formula*, not 70 authored values.
