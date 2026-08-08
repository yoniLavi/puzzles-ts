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

- [x] 2.1 Tier-2: preview paints target + mirror in `COL_DRAG`; vacated
      pair repaints on target move; nothing remains after the drag; all
      drag-frame paint inside the board; no full-board updates.
- [x] 2.2 Tier-2: uncommittable target draws nothing.
- [x] 2.3 Tier-1: release commits the previewed pair (lift-jitter case);
      same-tile drag returns `null`; nothing-to-commit release returns
      `UI_UPDATE` with no history entry.

## 3. Owner acceptance follow-ups (2026-08-08)

- [x] 3.0a The preview colour was the keyboard cursor's, which is a
      board-relative *tint* (`#ffaaaa` on a `#d5d5d5` board) and so is
      unreadable in both schemes. New `COL_DRAG` = `DRAG_ADD`, drawn
      heavier than a committed arrow; `COL_CURSOR` = the collection's
      `CURSOR`, since Galaxies' board never spent green. `galaxiesCursor`
      is deleted — it had no other caller.
- [x] 3.0b Fixing the colour exposed the same defect this change is
      about, one block further down: the half-grid keyboard cursor was
      also painted after the tile loop and left a mark at every vertex
      and edge it visited. Folded into the tile cache with the preview,
      in one `OverlaySidecar`; guarded by a test, mutation-checked.

## 4. Verification and close-out

- [x] 4.1 Live Chromium check: commit, sweep (smear repro), off-board
      release, re-drag-to-remove; console clean.
- [x] 4.2 Spec deltas: rendering requirement (drag preview + the
      fills-wording fix), play requirement (drag scenario matches the
      implementation).
- [x] 4.3 Docs live-wiki: rendering.md (overlay-must-erase-itself trap),
      input.md (the aim-drag shape, Inertia + Galaxies exemplars).
- [x] 4.4 Withdraw `add-galaxies-association-marks`; retarget
      `add-galaxies-hint` onto committed-association vocabulary.
- [ ] 4.5 `openspec validate fix-galaxies-drag-preview --strict`; owner
      acceptance; archive.
