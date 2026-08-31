# Tasks — unify-cross-game-vocabulary

## 0. Before touching anything

- [x] 0.1 **Check what the existing suites actually cover.** Answered by
      `audit-input-mode-parity`'s `audit.md` §2.3a(a) and *not* re-measured:
      **27 games' tests press an arrow key, 30 do not**. The thirty have no
      per-game net under the rename — `input-parity.test.ts` presses cursor keys
      for all 57 through a real `Midend`, which is a collection-wide net but not
      a per-game one, so §5's shape check is the evidence for those.
- [x] 0.2 Re-measure the three populations. **Both numbers in the proposal were
      low**, and the re-measure changed the work:
      - *Cursor*: **50 games, not 42**. The proposal counted six spellings of
        the visibility flag; the `Ui` dump found four more nobody had listed
        (`cursor`, `cursorShow`, `show`, `displaySel`) plus **Rome**, which had
        a cursor and *no* visibility flag, and **Ascent** and **Rome**, which
        hid visibility inside a mode enum.
      - *Completion*: `usedSolve` is **14 games, not the five implied** — and
        **Magnets spells `cheated` as `solved`**, the same word Loopy and Undead
        use for `completed`. A sweep that renamed by name would have inverted it.
      - Six games' **DrawState** caches the same three values under a second
        spelling (`hshow`/`curVisible`); leaving those would have been half a
        unification, so they move too.

## 1. The cursor `Ui` contract (50 games)

- [x] 1.1 `GridCursor` + `newCursor`/`moveCursor`/`showCursor`/`hideCursor` in
      `engine/pointer.ts`, per design D2. Kept to the noun. `moveCursor` returns
      *whether anything changed*, which turned out to be exactly the
      `moved || !wasVisible` predicate eight games had written by hand.
- [x] 1.2 Converted Slant (plain) and Tents (paints while moving) first. Tents
      did **not** fight the helper — it got *shorter*, because its two arrow
      branches differed only in the painting and merged once the movement was
      shared. The helper's shape is right.
- [x] 1.3 Converted the rest in five gated batches. Ascent and Rome by hand
      (see 1.6), Range by hand (its cursor is transposed — `(r, c)` is
      `(y, x)`), Palisade/Separate through `border-grid.ts`.
- [x] 1.4 Renderers swept alongside each game, plus the six DrawState caches.
- [x] 1.5 Genuinely different traversals kept: `border-grid.ts`'s half-cell walk
      (renamed `moveBorderCursor` so it no longer shadows the shared helper),
      Slide's grabbed-anchor walk (`moveSlideCursor`, whose *ungrabbed* half
      collapsed onto the shared one).
- [x] 1.6 **Two games held visibility inside a mode enum, and both were split.**
      Ascent's `cshow` was `NONE`/`KEYBOARD`/`MOUSE`: the device distinction is
      real and a player can see it, so it survives as `cursorFromMouse` with two
      predicates, while "is it shown" moved to `cursor.visible`. Rome's `kmode`
      had a fourth state `KEYMODE_OFF` doing the same double duty; it is gone,
      and `kmode` is now purely what the cursor is *armed for*.
- [x] 1.7 **Nine games had a private `moveCursor`, four of them byte-identical.**
      Keen/Solo/Towers/Unequal differed only in the name of the bound; Map, Rect,
      Samegame and Guess collapsed too. Guess's cursor runs over the peg/colour
      picker rather than a board — the same shape in a different space, so it
      takes the same shape.

## 2. The completion vocabulary (23 games renamed, 25 adopted `winFlash`)

- [x] 2.1 Renamed to `completed` / `cheated` on `State`. The population was
      larger and stranger than the proposal's: `usedSolve` in **14** games
      (fifteen galaxies lightup mines net netslide pearl signpost singles slant
      **sixteen** tents tracks twiddle), `hasCheated`+`wasSolved` in Range,
      `complete` in Flood and Samegame, `solved` in Loopy and Undead, `won` in
      Mines — **and `cheating` in Mosaic, a tenth spelling the guard found after
      the sweep, not before it.**
      - **Magnets spelled `cheated` as `solved`.** Loopy and Undead spell
        `completed` that way. One word, opposite meanings, in three games.
      - Mines' `Ui.completed` became `everCompleted`: it means "was *ever* won,
        so the clock stays stopped", survives an undo, and would now read as a
        duplicate of the state's.
      - The **midend's** `usedSolve` is untouched, and deliberately: it is a
        save-envelope key, so renaming it breaks every existing save. That is a
        player-visible compatibility break and therefore the owner's call.
- [x] 2.2 25 games adopted `winFlash`, matched on their *normalised* body rather
      than their text — the same condition was written six ways. Four games that
      omitted `!from.cheated` were adopted too: `cheated` is monotone in every
      game that has it, so `!to.cheated` already implies it.
- [x] 2.3 The bespoke celebrations are untouched, each with its reason recorded
      in `flash.ts`. Two came out differently from the proposal's guesses:
      - **Palisade and Separate are owner-requested divergences** — they flash a
        manual completion made *after* a Solve, which is a different condition,
        not a different spelling. The matcher left them alone and reading them
        found the decision.
      - **Fifteen, Sixteen, Twiddle and Slide** hold `completed` as a *number* —
        the move count they were solved at, frozen so the status bar stops
        counting. The name is unified; the type is a real difference. (Their two
        sentinels disagree — `0` vs `-1` for "ongoing" — which is a follow-up,
        not this change.)
      - Dominosa is the near-miss: its condition *is* the convention, so it now
        calls `winFlash` and uses the answer to also clear its hover highlight.
- [x] 2.4 **Four per-game specs did state a renamed flag normatively**, and got
      `MODIFIED` deltas: `fifteen` and `twiddle` (`usedSolve`, in a requirement
      *and* inside a scenario), `range` (`hasCheated`/`wasSolved`, across two
      requirements), `mosaic` (`cheating`). Unruly's mention is prose ("without
      cheating") and needs nothing. Each delta reproduces every surviving
      scenario, and each was written against the requirement that actually holds
      the sentence — grepped first, per the `AGENTS.md` hazard note.

## 3. The first-arrow-press unification (player-visible)

- [ ] 3.1 Find every game that reveals-only, and change it to reveal-and-move.
- [ ] 3.2 **Its own commit**, separable from §1 and §2, so it can be reverted
      alone.
- [ ] 3.3 Tier 2.5 on the games whose behaviour moves: the frame after one arrow
      press from a fresh board.
- [ ] 3.4 Owner acceptance — this is the one part a player can feel.

## 4. Guards against re-drift

- [x] 4.1 `src/engine/cursor-vocabulary.test.ts`. Its strongest check is
      **structural, with no name matching at all**: the cursor's field names are
      read off `newCursor()` itself, every game's real `newUi()` output is
      walked, and any property with that shape must be called `cursor`. A source
      pattern over the eight retired spellings sits beside it and is labelled as
      the weaker, list-shaped half. `emittable-keys.test.ts` already covers the
      helper-shadowing half, derived from `pointer.ts`'s export list — adding
      four exports there enrolled all 57 games the same day, and it named the
      nine private `moveCursor`s of task 1.7 immediately.
- [x] 4.2 Both new assertions proven to fail: renaming Slant's `Ui.cursor` to
      `slantCursor` fails the structural check by name-of-file-and-field, and
      re-adding a `cshow: boolean` fails the pattern check. The retired-spelling
      check **failed on first run against a real leftover** — Salad's renderer
      still took an `hshow: boolean` parameter.
- [x] 4.3 Vacuity, both directions: the games walked must equal the registry
      size, *and* at least 45 of them must actually have yielded a cursor —
      a structural check that finds none would otherwise report health.

## 5. Verify the bulk edit by shape

- [x] 5.1 Diff-shape classification over all 3547 changed lines: every one is a
      named kind or lands in a residue that is printed in full and read. The
      residue was dominated by biome reflows, which is why 5.2 exists.
- [x] 5.2 The stronger property, and the one that mattered: both revisions are
      normalised by mapping **every** spelling of the cursor onto three tokens
      and dropping comments, imports and whitespace, then compared. 122 of 188
      files are token-identical — *proved* pure renames, which no amount of
      green suite establishes. Every one of the other 66 was read; all are
      inline `newUi` literals, biome trailing commas, Range's deliberate
      transpose, or a rewrite named in this task list. Proven to fail by
      planting a one-token logic change in an otherwise-pure file.
- [x] 5.3 **Why the suite could not be the check here.** The first sweep
      renamed an unrelated `interface Sq { cx, cy }` in Flip's generator *and*
      all its uses. That compiles, and all 7596 tests pass. The fix was to scope
      the declaration rewrite to `*Ui` interfaces, which restores `tsc` as a
      complete net — a stray `a.cursor.y` then has no declaration to match.

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
