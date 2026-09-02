# reduce-colour-role-variation — tasks

Every sweep below was done in one session by three parallel agents over
disjoint game directories, from the census in `design.md`, with the lead
reconciling their reports. Per-slot before/after and the reason at each
departure are in the game sources themselves (the guard in A.6 requires it);
this file records the decisions that shaped the sweep.

## 0. The ruled-out edge (owner's playtest finding)

- [x] 0.1 `lineNoColour` is a mid grey in both schemes — `bg × 0.6` in light,
      an authored `[0.5, 0.5, 0.5]` in dark — a clear step off the board and
      apart from `correctRegionColour`, and still below ink. Pinned by
      `dark-palette.test.ts` ("the ruled-out edge"), beside the dark pipeline
      it measures through, since the engine may not import `utils/color.ts`
      (`module-layering.test.ts`). Dominosa's
      barrier edge adopted the role (it is the same "no line here" mark).

## A. One meaning, one role

- [x] A.1 Cursors. **The rule, now stated at `CURSOR` in palette.ts:** the
      cursor is a *mark* (ring, outline, line, disc) and is `CURSOR`; a cursor
      that *fills a cell under its content* is `highlightWash`, the "you are
      here" wash (Bridges, Mathrax, Magnets, Pearl, Rect, Slant, Salad,
      Unequal join Solo's family); when green is spent, the second choice is
      `PURPLE` (Spokes, Pegs, Filling, Signpost, Untangle, Sticks, Subsets).
      Board tints as cursors are gone (Bridges, Filling, Light Up, Signpost,
      Twiddle). Kept with a one-line reason: Slide `RED`, Mines `PINK`,
      Blackbox `RED`, Boats ink/paper, Guess `INK`. Rome keeps its two bevel
      tones because they carry place-versus-pencil mode, an affordance rather
      than a colour choice.
- [x] A.2 Held/drag: Signpost → `HELD`; Crossing's held box → `INK` (blue there
      means "across"); Pegs' keyboard pick-up ring gained a `HELD` slot; Inertia's
      aim arrow → `DRAG_ADD`; Untangle's drag point → `HELD`.
- [x] A.3 Hint roles: Undead → `HINT_EVIDENCE`; Light Up's unlit reference →
      `HINT_WHITEREF`; Clusters', Untangle's, Inertia's, Singles', Subsets'
      departures carry their reason at the assignment.
- [x] A.4 Black/white: Light Up, Singles, Range → `BLACK`/`WHITE` (pinned);
      Unruly's bases author their dark value and `mkhighlightSpecific` hands
      it on to the trio. Flood's separator → `BLACK`.
- [x] A.5 One-offs: Boats `ERROR_TEXT` and `clueDoneColour`; Mines' digit 8
      `GREY`; Pattern's cursor guide is the cursor's colour; Filling's
      region-correct → `correctRegionColour`; Crossing's selected run →
      `highlightWash`; Salad's ball and cross → `playerEntryColour`; the four
      `[...x]` token copies → direct assignment. Group and Rome draw no
      pencil-mode glyph, so no body slot (an affordance, not a colour).
- [x] A.6 `palette-departures.test.ts`: every slot named cursor/held/drag/hint
      is the role or carries a comment on the line or the line above, in both
      the indexed and the positional palette shape; counts 57 games; seen red
      on the pre-sweep tree (12 cursors, 7 hints, 1 held).

## B. Roles for the derivations

- [x] B.1 "This clue is done": text → `clueDoneColour` (Loopy — a deliberate
      new aid, upstream drew it in ink; Mosaic; Boats), fill →
      `correctRegionColour` (Spokes). Named in the guide.
- [x] B.2 Grid lines: thirteen board derivations → `GRID_MID` (Blackbox,
      Bridges, Flip, Galaxies, Light Up, Net, Netslide, Rect, Signpost, Slant,
      Singles, Sokoban). Kept with a reason: Tracks' grid (sits between the
      board and the track bed; `GRID_MID` is the rails' grey).
- [x] B.3 `palette-games.ts`: twenty orphaned names deleted; what remains is
      per-game meaning (`netLocked`, `minesLowlight`, `slantGrounded`,
      `crossingGhost`, Signpost's region sets, Guess's board, Unruly's bases).

## C. The flash

- [x] C.1 `FLASH` (= `PAPER`) for every flash drawn as a fill or line: the
      white-fill games, the highlight games, and the three lowlight games
      (Singles, Mathrax, Range), which now light up rather than dim. Untangle's
      two-colour alternation folded to `FLASH`/background. Kept as their own
      mechanism: bevel waves (ABCD, Rome, Seismic, Salad, Pegs, Mines), state
      swaps (Pattern, Mosaic, Clusters, Bricks, Unruly, Boats, Dominosa,
      Bridges, Subsets), `highlightWash` under text (Solo's family), colour
      cycles and geometry-only flashes.
- [x] C.2 Palisade's upstream lowlight flash is recorded in `design.md`; the
      port keeps the collection's white flash.

## D. Overrides

- [x] D.1 Flood (`BLACK` separator), Galaxies and Solo (`INK` grids at full
      strength, as the other 25 `INK` grids): overrides retired.
- [x] D.2 Bricks' and Mines' background halves retired with the board unified;
      Light Up's and Unruly's retired by pinning; Mines' flag base at full
      ink; Twiddle's cursor swap retired (both slots are `CURSOR`). Pearl's
      `{0: 1.15}` kept — the one genuine scheme tweak.
- [x] D.3 Token copies replaced (Signpost, Sokoban, Flip, Galaxies).

## E. Verify

- [x] E.1 Every re-baselined snapshot checked by shape: only `rgb`/colour
      values changed on otherwise-identical ops (each agent reported the
      count; none moved anything else).
- [x] E.2 tsc, biome (whole tree), probe anchors, and the colour, puzzle and
      affected game suites green; the full suite at the commit gate.
- [ ] E.3 Chrome, both schemes: Loopy and Palisade ruled-out edges; Light Up
      and Singles pinned black on the dark board; a `highlightWash` cursor
      (Rect); a purple cursor (Spokes); Sokoban's barrel labels.
- [ ] E.4 Owner acceptance of the player-visible changes (all of A, B, C, D
      are visible; the ones flagged by the agents for a specific look:
      Crossing's held box, Loopy's greyed satisfied clues, Pearl's and Rect's
      cursor wash, Range's bracket cursor, the three lowlight-to-white flashes).
