# reduce-colour-role-variation — tasks

Scaffolded from the census in `design.md`; nothing below is implemented. Each
sweep is player-visible and ends with a look in Chrome in both schemes.

## A. One meaning, one role

- [ ] A.1 Cursors: the seven unexplained departures become `CURSOR` or say why
      in one line; Filling/Light Up/Signpost drop their three `bg × 0.5` names;
      Bridges leaves the warm board tint as Galaxies did.
- [ ] A.2 Held/drag: Signpost → `HELD`; Crossing's `COL_HELD` decided; Pegs and
      Untangle → `DRAG_ADD`/`DRAG_REMOVE`.
- [ ] A.3 Hint roles: Undead → `HINT_EVIDENCE`; Light Up's dark-ref → the
      white-ref role or a stated reason; Untangle's and Clusters' hint hue
      argued or replaced.
- [ ] A.4 Black/white tiles: Light Up and Singles → `BLACK`/`WHITE`; Unruly's
      bases get authored dark values; the two `augmentation.ts` overrides go.
- [ ] A.5 One-offs: Boats `ERROR_TEXT`; Mines' digit 8; Pattern's cursor guide;
      Filling's region-correct → `correctRegionColour`; Group/Rome
      `PENCIL_BODY`; Untangle's drag point; Crossing's `COL_SELECTED`.
- [ ] A.6 A cross-game guard keyed on the shape of the assignment (a cursor
      slot that is not `CURSOR` carries a comment on the same line), proven
      red before trusted.

## B. Roles for the derivations

- [ ] B.1 "This clue is done": one role; Boats, Mosaic, Spokes, Loopy adopt it
      or say why not.
- [ ] B.2 Grid lines: classify the thirteen derivations into identity versus
      inheritance; the inherited ones → `INK`/`GRID_MID`/`GRID_DARK`.
- [ ] B.3 `palette-games.ts`: collapse each duplicate-arithmetic group to one
      name per meaning.

## C. The flash convention (own proposal)

- [ ] C.1 Owner decision: one collection-wide solved cue, or one per family.
- [ ] C.2 Record Palisade's upstream lowlight flash alongside the decision.

## D. Overrides

- [ ] D.1 Flood, Galaxies, Solo: decide the `INK`-that-should-not-invert cases
      as roles, then retire the overrides.
- [ ] D.2 Bricks' and Mines' background halves retired now the board is one
      tone; Pearl's `{0: 1.15}` kept or given a role.
- [ ] D.3 The four `[...x]` token copies replaced by direct assignment.
