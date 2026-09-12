## 1. Widen the instrument

- [ ] 1.1 Add the draw state's own field names to `capabilitySets()`, built off
      the `state` `builtGames()` already memoizes, and **sized** before reading
      (an unsized draw state can leave fields unassigned, which would
      under-report). Names only — not sizes, values or types.
- [ ] 1.2 Re-baseline the snapshot and read the diff once, in full: it should be
      a new key per game and nothing else moving.
- [ ] 1.3 **Prove it fails.** Remove a field from one game's `newDrawState` and
      confirm the snapshot moves; restore. A guard nobody has seen fail is a
      guard nobody has seen work.
- [ ] 1.4 Confirm the claim that motivated this: `pencilModeShown` now appears
      against nine games in one glance.

## 2. Fix what reading already found

Each is its own commit, and each must move **no** recorded draw call — a rename
that re-baselines a render snapshot is not a rename.

- [ ] 2.1 Bricks `dragtype` → `dragType`, matching Clusters and Sticks and the
      model `docs/games/input.md` § "The accreting-paint drag" documents.
- [ ] 2.2 Bridges' `aiming` → a name Inertia is not already using (it has
      `aiming` and `aimDir` for the aimed move direction). Self-inflicted by
      `name-the-drag`; Bridges' means "the pointer has left the source island".
- [ ] 2.3 The pixel/grid drag position, **read per game, not replaced in bulk**:
      Ascent's `dragx`/`dragy` are a grid cell, Map's and Guess's are pixels
      (Guess spelling it `dragX`). Give the unit the name, so the two pixel
      games agree and Ascent's pair says cells. Renaming Guess to match Map
      without this would leave three games sharing one name for two units.

## 3. Record what is a finding rather than a defect

- [ ] 3.1 Pegs and Signpost already agree on `sx`/`sy` (grid anchor) + `dx`/`dy`
      (pixel current) + `dragging` — a second, consistent drag shape distinct
      from `GridDrag`'s. Record it where the next reader of either meets it
      (`docs/games/input.md` § "Drag models"), and cross-reference
      `name-the-drag` § 4.1, which defers exactly this pair.
- [ ] 3.2 Note in `docs/games/testing.md` what the widened snapshot is for: the
      class of divergence a clone detector cannot see, with the pencil indicator
      and the drag anchor as the two worked examples.

## 4. Close

- [ ] 4.1 Run the full gate. No app check is needed if every commit moved no
      recorded draw call — and if one did, it is not a rename and needs one.
- [ ] 4.2 Archive the change.
