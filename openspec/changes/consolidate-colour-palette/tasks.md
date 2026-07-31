# Tasks — consolidate-colour-palette

> Colours **move** in this change — that is the point, and the opposite of its
> predecessor. So the guards that stay green are the ones about *structure* (no
> game holds a colour value; no game imports another game's colour), and the
> artefact that gets read is the before/after inventory (design D5). Render
> snapshots will move: review each as a diff, never a blind `vitest -u`.
>
> Run only the test files relevant to each step; the full suite runs once, at
> commit.

## 1. Design the palette against the hardest constraint

- [x] 1.1 Choose the **named colours**: truthful, scheme-stable names, a value per
      scheme, sized by "ten mutually distinguishable members" because that is what
      Flood, Guess and Samegame need (D2, and the constraint that makes the number
      an answer rather than a preference).
      → `src/native/engine/colours.ts`: **eight hues** (red, orange, yellow, green,
      teal, blue, purple, pink) × three intensities, plus grey × three, plus brown,
      black and white. **Twelve names.** Authored in OKLCH, converted to sRGB in the
      module (no colour library reaches the worker).
      Two findings that shaped it, neither available by eye:
      - **brown is not a hue.** At the wash and bold steps orange and brown collapse
        to 0.01 apart, because brown *is* dark low-chroma orange. It is its own name
        rather than orange's bold step because it must not invert — orange's bold
        step goes light in dark mode, and a light brown is not brown.
      - **"pale" cannot be a name.** The wash step must be dark in dark mode, so an
        appearance name would be false in one scheme, which D2 forbids for anything
        that reaches a player. The steps are named for their role: `_WASH`, `_BOLD`.
- [x] 1.2 Verify the set with `scripts/colour-dark-check.test.ts`'s pairwise metric
      in **both** schemes, not by eye — the baseline to beat is light 0.134 / dark
      0.070. Author the dark values here; this is the pass deferred from
      `colour-tokens-per-scheme`.
      → The lightnesses are the output of a search that maximises the worst pair in
      every set at once. `colours.test.ts` re-measures all six, in both schemes,
      against the number upstream's hand-written set actually scored:

      | set | upstream | light | dark |
      | --- | --- | --- | --- |
      | ten (flood, guess) | 0.134 | **0.159** | **0.158** (was 0.070) |
      | nine (samegame) | 0.127 | 0.159 | 0.158 |
      | six counts (mines) | 0.142 | 0.159 | 0.144 |
      | eight fills (signpost) | 0.071 | 0.087 | 0.081 |
      | four fills (map) | 0.077 | 0.115 | 0.123 |

- [x] 1.3 Settle the intensity axis at **two** steps (a solid and a wash) and add a
      third only against a case the two cannot serve (D3). Record any case that
      forces one.
      → **Mines forced the third.** Its count digits are 1-blue/4-navy and
      3-red/5-maroon, two pairs that must be told apart *as digits*; a wash is a
      fill, not a digit. Recorded in `colours.ts`. Nothing else forced a fourth.

## 2. Define the meanings over it

- [x] 2.1 Re-express the ~21 shared roles in `palette.ts` as **references** to named
      colours rather than independent values.
      → Every role is now `ERROR = RED`-shaped, and `palette.test.ts` checks it **by
      identity**: a role that held its own value would be a colour decision wearing
      a role's name, which is what 170 of the deleted tokens were. Two exemptions,
      both earned: `INK` and `PAPER` are *maximum contrast against the surface*, so
      they must be adapted by the scheme rather than authored.
      Six new meanings, each replacing a cluster of per-game tokens: `CURSOR`,
      `HELD`, `GRID_DARK`, `UNDECIDED`, `DRAG_ADD`, `DRAG_REMOVE`.
- [x] 2.2 Keep the derived roles derived (D4).
      → All seven stay. One **graduated**: `errorWash(bg)` became `ERROR_WASH =
      RED_WASH`. It was a function only because a wash had to track the board before
      the wash step was authored per scheme — and being handed pure white in dark
      mode, it could not.
- [x] 2.3 Check the hint vocabulary survives: `HINT_ACTION` and `HINT_FILL` are two
      roles because a fill behind a digit must stay readable.
      → They are one hue at two steps now (`BLUE`, `BLUE_WASH`), which is exactly the
      distinction. **`HINT_EVIDENCE` changed hue** rather than becoming a third blue:
      seven games paint evidence and target at once and the two were eight
      hundredths of a lightness apart. It is `TEAL_WASH`.

## 3. Collapse the enumerated sets

- [x] 3.1 flood, guess, samegame, map, mines, signpost.
      → `TEN` (flood, guess), `TEN.slice(0, 9)` (samegame — samegame drops the grey,
      which among coloured tiles reads as a hole), `EIGHT_FILLS` (signpost, still
      midpointed to sixteen), `FOUR_FILLS` (map), and named colours for Mines' six.
- [x] 3.2 Re-run the pairwise metric per set and record the before/after.
      → Table in 1.2. Every set beats its upstream number in **both** schemes.
- [x] 3.3 Check Flood's hint reads true: the tile it calls yellow is yellow, in both
      schemes (D2).
      → `COLOUR_NAMES` is now `TEN_NAMES`, re-exported from the palette, so the word
      and the colour come from the same place and cannot drift.

## 4. Collapse the rest

- [x] 4.1 Game by game: each token becomes a meaning, a named colour, or a written
      exception (D7). No silent survivals.
      → **123 absolute tokens across 35 games**, all gone; `palette-games.ts` is
      1125 → ~410 lines. `palette-source.test.ts`'s "declares no token no game uses"
      is what proves none was left stranded.
- [x] 4.2 Decide the identity cases explicitly rather than by default.
      → **Mosaic keeps its teal board** — `TEAL_WASH` unmarked, `TEAL_BOLD` grid; the
      identity was a hue, and a hue is what the palette has.
      **Crossing's OKLCH-matched pair is now the palette's obligation, not
      Crossing's**: blue's and orange's wash *and* bold steps are tied in lightness
      and chroma in `colours.ts`. (The bold half was missed on the first cut and
      Crossing's own equal-strength test caught it — which is the argument for
      having moved the constraint into the palette.)
      **Map's muted earth tones went.** They were chosen so four saturated hues over
      a whole board would not be unpleasant; the wash step answers that already, and
      the earth tones measured 0.077 — the worst set in the collection, in a game
      whose entire point is telling neighbouring regions apart.
- [x] 4.3 Retire the `augmentation.ts` `paletteOverrides` entries the palette now
      absorbs; keep only genuine per-board judgements and say which.
      → Four removed (boats' water, bricks' brick, mosaic's unmarked tiles, tents'
      grass) — exactly the four that were patching an index which now carries an
      **authored** dark value, i.e. that had started fighting a deliberate decision
      rather than correcting a calculated one. The remaining nine all patch a
      *derived* colour or the host background, which is a per-board judgement the
      palette cannot make.
- [x] 4.4 Reduce `palette-games.ts` to the exceptions, or delete it.
      → Reduced. What is left is board-relative derivations (D4) plus **one**
      absolute exception, Unruly's two tile colours, argued where they are declared:
      they are *bevel bases*, and near-black/near-white is headroom, not a shade —
      `BLACK` would leave a black tile with no highlight.

## 5. Verify and close out

- [x] 5.1 The structural guards stay green throughout: no game holds a colour value,
      no game imports another game's colour (`palette-source.test.ts`).
- [x] 5.2 Regenerate `inventory.md` as the before/after artefact (D5).
      → `inventory.md`, now naming the colour and the meanings that resolve to it
      (`RED (ERROR)`, `GREEN (CURSOR, HELD, HINT_BLACKREF)`). 624 of 687 entries are
      a colour from the table outright; the other 63 are computed from one.
- [x] 5.3 Browser pass in **both** schemes over the games whose appearance moved
      most; a green suite is not acceptance.
      → Chrome, light and dark, on flood, map, mines, signpost, crossing, lightup,
      mosaic, guess. **Found and fixed one real regression the suite could not see**:
      Light Up's lit square was plain `YELLOW`, which is a near-board tint under a
      light scheme and a *bright patch* under a dark one — the Slide failure mode
      from `hand-author-dark-palette` F1. It is a large fill with bulbs and digits
      drawn on it, so it is `YELLOW_WASH`. Surfaced by `colour-dark-check.test.ts`
      (its background-relationship count went 2 → 57, and this was the one entry in
      the 57 that was a fill rather than a mark, a never-invert identity, or
      pre-existing).
      **One judgement to look at**: that lit square is now a soft cream rather than
      a saturated yellow — correct for a fill, and less punchy than upstream.
- [x] 5.4 Update playbook §3.3 again: a new port picks a meaning, and reaches for a
      named colour only where the name is load-bearing to the player.
- [x] 5.5 Full gate green; `openspec validate consolidate-colour-palette --strict`.
      → `npm run gate`: 245 files, **6436 tests**, exit 0. Change validates strict.
      Snapshots: 44 files re-baselined, and the review is mechanical rather than by
      eye — **every changed line in every one is an `rgb`/`fillRgb`/`outlineRgb`
      value**, so not one op was added, removed or moved.
- [ ] 5.6 Owner acceptance on the **appearance**, then archive.

## Out of scope

A theme picker, a persisted theme preference, or a third scheme. This change makes
a third scheme cheap — it becomes one value per named colour — but does not add
one.
