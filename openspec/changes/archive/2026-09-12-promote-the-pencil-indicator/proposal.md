# Promote the pencil-mode indicator, and say which cache shape to reach for

## Why

The engine already owns the pencil-mode **glyph** (`drawPencilGlyph`). It does
not own the four lines around it, so eleven games each wrote those, and the
population has drifted in three separate places.

**The painter.** Eight games define a private `drawPencilIndicator`, and a ninth
(Salad) inlines it. Every body is the same three statements — paint the box in
the background color, draw the glyph if the mode is on, invalidate the box:

    dr.drawRect(box, background);
    if (on) drawPencilGlyph(dr, box.x, box.y, size, body, ink);
    dr.drawUpdate(box);

Everything that differs is legitimately the game's: *where* the box sits and
*which* palette indices it uses. Keen, Solo and Unequal are character-identical
apart from how each computes `ox`. The `drawUpdate` is the half that is easy to
forget, and it is the half being re-typed.

**The cache.** Nine games write the same four-line sidecar cache, and every one
of them also arranges a frame-1 paint — by **three different mechanisms**:
`firstFrame ||` at the cache site (abcd, keen, mathrax, seismic, solo),
`!ds.started ||` at the cache site (salad, undead, unequal), and a *second call
site* inside the `!ds.started` block (crossing).

The three are equivalent, and establishing that took two passes. A scan keyed on
the conditional at the cache site reports Crossing as having no first-frame guard
at all — it has one, twenty lines further up, which is the collection's standing
trap (`AGENTS.md`, "a scan that keys on a name finds only the games that were
named that way"). Nine initializers then had to be read to confirm all nine start
at `pencilModeShown: false`. Two passes to establish that nine copies agree is
the argument for there being one.

**Which cache to use at all.** Towers does not have a sidecar. It packs the mode
into its **tile cache** as a bit (`DF_PENCIL_MODE` on tile `w+1`), so there is no
second key and no second key to forget an input from. That matters beyond taste:
the sidecar form is exactly where `fix-stale-ui-and-cache-state`'s Crossing
defect lived — a second cache whose key stopped naming one of its inputs. The
rule is real and is written down nowhere.

## What changes

- `engine/pencil-indicator.ts` gains `repaintPencilIndicator`, beside the glyph
  it already owns: the box, the glyph, the invalidation **and** the repaint
  decision. Nine games call it in one line each.
- The cache carries "never painted" as `null`, so no game passes a first-frame
  flag and the three spellings do not get unified — they cease to exist.
- **It gains the test that nine copies were never going to get.** Deleting the
  `drawUpdate` from all nine at once failed zero tests, because
  `RecordingDrawing` keeps it out of `ops` deliberately and exactly one test in
  the repository reads the `updates` array. That is the strongest argument here,
  and it is the general one: a duplicated shape is also a test that costs N
  times as much to write, so it does not get written.
- `docs/games/rendering.md` states the cache-shape rule, with Towers as the
  exemplar and Crossing as the counter-example.

## What this change does not do

- **It does not convert Towers.** Its tile-cache form is the one being
  recommended, not the one being replaced.
- **It does not give Group an indicator.** Group carries no `pencilSticky` and
  shows pencil-ness through the highlight instead (`DF_HIGHLIGHT_PENCIL`). Those
  are one coherent decision — a non-sticky mode has no persistent state to
  advertise — not two omissions, so nothing here is a gap to close.
- **It moves no pixel.** Eight of the nine move no recorded draw call either.
  Crossing's three snapshots move because its indicator was painted early
  (inside `!ds.started`) and is now painted at the end of the frame like
  everyone else's — an **ordinal move only**, verified two ways: every added
  line in the snapshot diff has an identical removed line, and nothing paints
  inside the indicator's box between the two positions.
