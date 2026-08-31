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

- [x] 3.1 The audit's five reproduce exactly — **pearl, range, signpost,
      sixteen, tracks** — and all five now reveal-and-move. 51 of 57 games have
      a cursor and every one of them now moves on the first press; the other six
      (cube, fifteen, inertia, loopy, sokoban, untangle) have no cursor to move.
      - **Three of the five kept a narrower reveal-only case, and should have.**
        Pearl's *modified* arrow marks a line, Range's *shifted* arrow dots the
        cells it passes, and Sixteen's arrow **is a slide** in its locked and
        modified modes. A first press must not move the board out from under a
        player who cannot yet see where it would act, so those still reveal.
        The unification is about the arrow that only moves a cursor.
- [x] 3.2 Its own commit, separable from §1 and §2.
- [x] 3.3 Two nets, because the five games' own suites **all stayed green** when
      the behaviour changed — nothing anywhere asserted it:
      - a collection-wide behavioural guard in `cursor-vocabulary.test.ts`, over
        every game with a cursor, which is the level the question lives at;
      - a tier-2.5 *frame* check on Tracks, the hardest case (its cursor walks a
        half grid and skips square corners, so "moved by one" is not "moved by
        one tile"). Both proven to fail by restoring the old behaviour.
      - Reaching that frame needed a new `presses` option on the shared
        `renderScenario` harness: a keyboard cursor is `Ui` state, so no `Move`
        can put it anywhere, and "the frame after one arrow press" was a frame
        the harness could not reach at all.
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

- [x] 6.1 `ts-engine`: two ADDED requirements (the cursor `Ui` contract, the
      completion vocabulary) **and one MODIFIED** — the cursor-delta requirement
      normatively said "the *first arrow-press only reveals the cursor* idiom …
      SHALL stay in each game", which §3 makes false. Found by grepping the live
      spec rather than by assuming the additions were enough.
- [x] 6.2 `docs/games/input.md` — the interim "match the nearest neighbour
      rather than inventing a seventh name" is replaced by the settled rule,
      including the *action-arrow* exception and the two games that keep an
      extra flag beside the cursor. `engine-catalog.md`'s `pointer.ts` entry
      now leads with the cursor rather than the button codes.
- [x] 6.3 `docs/games/rendering.md`: the interim framing is gone, replaced by
      the four shapes that qualify for a bespoke hook and by Dominosa as the
      worked near-miss.
- [x] 6.4 `docs/framework-rdd/game-definition.md`: both shipped items struck
      through and repointed at the live guides. Each keeps **what the survey got
      right or wrong**, which is the part worth carrying: the save-format worry
      was unfounded for exactly the predicted reason, and both counts were low
      because the survey counted *spellings* rather than measuring a population.
- [x] 6.5 `openspec validate unify-cross-game-vocabulary --strict` — valid.
- [x] 6.6 `docs/games/testing.md`: the new `presses` option, with the reason it
      exists (`moves` reaches a board state, `presses` reaches a `Ui` state).

## 7. Owner acceptance evidence (browser, Chrome via `playwright-cli`)

The suite cannot say a frame composited correctly, and three of these edits were
invasive enough to want the eye:

| Game | What was checked | Result |
|---|---|---|
| Tracks | one arrow press from a fresh board | cursor appears **one half-step right**, on the edge — reveal-and-move, with the corner-skipping traversal intact |
| Range | one `ArrowDown` | the highlight moves down a **row**, so the `(r, c)` ↔ `(x, y)` transpose is the right way round |
| Ascent | two arrow presses | the green corner-bracket **keyboard** cursor draws, so the `cshow` tri-state split kept the device distinction |
| Rome | arrow, then Enter | grey (armed to *move*) then white (armed to *place*) — the `kmode` three-way split renders correctly |
| Magnets | Solve | board fills, end dialog appears, **no win flash** — the half the `solved`→`cheated` rename could have inverted |
| Range | solved by walking the hint plan | **"Solved!"** with the flash playing — `winFlash` still fires on an un-cheated win |

## 8b. Owner decisions, taken after the first pass (2026-08-31)

- [x] 8b.1 **The save envelope's `usedSolve` is now `cheated`, and old saves
      still load.** Owner: *"ok to invalidate old saves (unless there is an easy
      way to just fix them in flight)."* There is: `decodeSave` is the single
      choke point, so `v: 1` is lifted to `v: 2` by renaming one key before
      validation. The validator then describes only the current shape and cannot
      drift into blessing both. Four tests cover it, including that the retired
      key is *gone* rather than carried alongside, and that a `v: 1` save with a
      missing or malformed flag is still rejected — the upgrade must not
      manufacture a `cheated` out of nothing.
- [x] 8b.2 **Palisade and Separate now use `winFlash` — by `winFlash` adopting
      *their* rule, not the reverse.** Revisiting the "owner-requested
      divergence" found it was a **bug fix** (`8bc695c`, owner-reported: using
      Solve, unmarking some walls and re-solving by hand produced no
      celebration), and that commit says generalising it was **deferred**. So
      Palisade was right and the other twenty-five were lagging.
      - The shared rule now suppresses the Solve **move** (where `cheated` flips
        false→true), not a cheated **board**. That is strictly additive: it never
        removes a flash, and the only case it changes is the one the player
        reported.
      - **It had no test coverage at all**, which is why every suite stayed green
        through the rule change. `flash.test.ts` now pins it, proven by
        restoring the old condition and watching it go red.
      - **The remaining gap is upstream of the flash and is honestly still
        deferred**: reaching the case needs `completed` recomputed each move, and
        a source scan shows almost every game sets it true and never back.
        Palisade and Separate recompute. Un-latching the rest changes `status()`,
        and with it the end-of-game dialog and the clock — per-game work, not a
        sweep, exactly as `8bc695c` judged.
      - *Instrument note*: a first probe reported "45 games recompute, 0 latch"
        and was discarded. It Solved, then **undid**, and undo restores an
        earlier *state object* — whose `completed` was false whether the game
        latches or not. It measured "does undo go backwards", which is trivially
        true for all 57.
- [x] 8b.3 Both re-anchored `feedback-probe` cases re-run and still caught:
      `save.ts` 5/5, `midend.ts` 21/21. Re-anchoring alone would only have
      proved the case still *applies*, not that it still fails.

## 8. Found on the way — handed off, not fixed here

- **The move-count completion family disagrees with itself.** Fifteen, Sixteen,
  Twiddle and Slide all hold `completed` as the move count they were solved at,
  and use **two different sentinels for "ongoing"**: `0` in the first three,
  `-1` in Slide. Slide's can represent "solved in zero moves" and the others'
  cannot, so they are not interchangeable, and nothing above them can read the
  four the same way. Naming is unified; the *type* is the next question, and it
  is a change of its own rather than a rename.
- ~~The midend's `usedSolve` is the last holdout~~ — **settled in §8b.1**: it is
  `cheated`, and `v: 1` saves are upgraded on read rather than discarded.
- **Mines' Solve never marks the board won.** It reveals the whole grid and sets
  the cheat flag, but leaves `completed` false, so `status()` stays `"ongoing"`
  and the player gets no end-of-game state. Byte-identical either side of this
  change and faithful to `mines.c`, so it is a finding rather than a regression —
  but it is why the legacy-save test asserts *fidelity* (restore reports what
  the save reported) rather than a hard-coded `"solved-with-help"`.
- **Two `feedback-probe` runs at once corrupt each other**, and the second one's
  "anchor not found" points at a line that is sitting right there in git. The
  probe edits engine source in place and restores in a `finally`; a second run
  reads its baseline mid-plant. It happened here, and because the change was
  already `git add`ed, the plant sat in the working tree beside staged work.
  Written up in `docs/test-strength.md` § 2a.
- **The one-off verification instruments are deliberately not committed.** The
  token-identity check compared the working tree against the pre-sweep `HEAD`;
  once the sweep is committed that baseline is gone, so a committed copy would
  be a recipe that fails on its first step. What it *established* is recorded in
  §5, and rebuilding it for the next sweep is a page of code, most of which
  would have to be rewritten for a different vocabulary anyway.
