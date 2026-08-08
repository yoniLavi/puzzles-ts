# Tasks

## 1. Implementation

- [x] 1.1 Extract `okToAddAssocWithOpposite` / `addAssocWithOpposite` /
      `removeAssocWithOpposite` to `moves.ts` (the render↔index split).
- [x] 1.2 `Ui`: replace pixel `dx`/`dy` with snapped `targetX`/`targetY`;
      press/drag/keyboard paths maintain it; drag returns `null` when the
      snapped target is unchanged.
- [x] 1.3 Renderer: per-tile `preview` sidecar plane in the cache-miss
      check; cursor-colour arrow at target + mirror, inset outline on the
      target; delete the pixel-arrow overlay block and its full-board
      `drawUpdate`.
- [x] 1.4 `dropDrag`: commit the previewed target; emit the assoc op only
      when `okToAddAssocWithOpposite` passes (no empty undo entries).
- [x] 1.5 Correct the stale LEFT_BUTTON comment (claimed an unported
      stylus drag fallback).

## 2. Tests

- [x] 2.1 Tier-2: preview paints target + mirror in `COL_CURSOR`; vacated
      pair repaints on target move; nothing remains after the drag; all
      drag-frame paint inside the board; no full-board updates.
- [x] 2.2 Tier-2: uncommittable target draws nothing.
- [x] 2.3 Tier-1: release commits the previewed pair (lift-jitter case);
      same-tile drag returns `null`; nothing-to-commit release returns
      `UI_UPDATE` with no history entry.

## 3. Verification and close-out

- [x] 3.1 Live Chromium check: commit, sweep (smear repro), off-board
      release, re-drag-to-remove; console clean.
- [x] 3.2 Spec deltas: rendering requirement (drag preview + the
      fills-wording fix), play requirement (drag scenario matches the
      implementation).
- [x] 3.3 Docs live-wiki: rendering.md (overlay-must-erase-itself trap),
      input.md (the aim-drag shape, Inertia + Galaxies exemplars).
- [x] 3.4 Withdraw `add-galaxies-association-marks`; retarget
      `add-galaxies-hint` onto committed-association vocabulary.
- [ ] 3.5 `openspec validate fix-galaxies-drag-preview --strict`; owner
      acceptance; archive.
