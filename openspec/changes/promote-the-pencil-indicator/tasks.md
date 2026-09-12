## 1. The engine owns the indicator

- [x] 1.1 Add `repaintPencilIndicator` to `engine/pencil-indicator.ts`, beside
      the glyph, with `PencilIndicatorStyle`, `PencilIndicatorBox` and the
      structural `PencilIndicatorCache`.
- [x] 1.2 Make the cache carry "never painted" as `null`, so no game passes a
      first-frame flag. Confirmed this is not merely shorter: abcd, Keen and
      Solo's `firstFrame` local had no other reader and goes away, and
      Crossing's second call site in `!ds.started` goes with it.
- [x] 1.3 Convert the nine games — abcd, crossing, keen, mathrax, salad,
      seismic, solo, undead, unequal — to a one-line call each.
- [x] 1.4 Prove the guard watches, per `rendering.md`. **It did not**: removing
      the `drawUpdate` failed zero tests across all nine, because
      `RecordingDrawing` keeps it out of `ops` and one test in the repository
      reads the `updates` array. Wrote `pencil-indicator.test.ts` and confirmed
      it catches all three mutations (no `drawUpdate` → 2 failures; glyph never
      drawn → 2; never-painted state ignored → 1).
- [x] 1.5 Verify byte-clean. Eight of nine move no recorded draw call at all.
      Crossing's three snapshots move because its indicator was painted early
      (inside `!ds.started`) and is now painted at the end of the frame:
      re-baselined, and verified to be an **ordinal move only** — every added
      line has an identical removed line, and nothing paints inside the
      indicator's box in between (checked: every op there has endpoints at
      x ≥ 20, y ≥ 20, and the box covers pixels 0–19).

## 2. The rule

- [x] 2.1 State the cache-shape rule in `docs/games/rendering.md` — prefer a bit
      in the tile cache over a sidecar scalar; Towers is the exemplar, Crossing
      the counter-example.
- [x] 2.2 Update `docs/games/engine-catalog.md`: name the new export, and point
      placement answer 2 at the rule before it is chosen over answer 1.

## 3. Close

- [ ] 3.1 Run the full gate, then open two of the nine in the running app (one
      corner-placed, one board-edge-placed) and toggle pencil mode on and off.
- [ ] 3.2 Archive the change.
