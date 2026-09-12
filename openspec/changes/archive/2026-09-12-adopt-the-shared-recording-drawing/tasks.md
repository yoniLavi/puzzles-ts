## 1. Measure the cost on the two hardest first

- [x] 1.1 Migrate Mosaic's and Flood's render tests to `RecordingDrawing`, and
      for each, plant the defect the test's title names, see it red, restore.
      Mosaic: a solved clue painted as a mistake — red. Flood: the victory
      rainbow flattened to one color — red.
- [x] 1.2 The cost per file, recorded.

      **Translation, not tightening.** No assertion had to be strengthened to
      survive the move; the changes are the op names (`drawRect` → `rect`), the
      shape fields (a polygon's and circle's fill is `fill`, where the local
      doubles flattened fill and outline into one `color`), and a line's
      `x1/y1/x2/y2` where the doubles kept a bare `x`.

      **The typechecker does the enumeration.** The shared recorder's op type is
      a discriminated union, so every mistranslated assertion is a *type error*
      rather than a test that quietly checks something else. That is the single
      biggest reason the remaining twelve were cheap.

      **One thing had to be added to the engine, and one to the recorder.**
      `Array.prototype.filter` does not narrow a discriminated union, so every
      migrating file hit that on its first assertion: `opsOfKind(ops, "rect")`
      is the one helper, added rather than cast away per file — a cast here
      would be the `as unknown as GameDrawing` this change exists to remove,
      reappearing one level down. And the recorder **drops** `drawUpdate`, which
      Cube's test asserts; rather than lose that guarantee or add a line to
      every snapshot in the collection, `drawUpdate` rects are now counted on
      `dr.updates`, outside `ops`.

## 2. The remaining twelve

- [x] 2.1 Migrated: Cube, Samegame, Guess, Twiddle, Blackbox, Fifteen, Palisade,
      Unruly, Sixteen, and `engine/draw.test.ts`. Fourteen files in all.
- [x] 2.2 The local `Op` types, literal doubles and casts are gone. **`as unknown
      as GameDrawing` in `src/**/*.test.ts`: zero.**
- [x] 2.3 Test count unchanged, no snapshot re-recorded, no snapshot added.
- [x] 2.4 Plant-and-restore, per file. **11 of 11 applied plants caught**, each
      a real defect the file's own assertions name (a color lost, two bevel
      wedges collapsed to one, a premise mark and a move mark made the same
      color, an empty tile painted as a placed zero).

      **The sweep's own instrument was wrong twice, and both are worth stating**
      because the failures looked like findings. The first version rewrote a
      color only where it was passed *directly* to a `dr.draw*` call, so it
      applied to none of the games that route colors through a shared helper and
      reported five "n/a"s as though the tests were at fault. And Sixteen looked
      like a test that could not fail — its hint-fill could be deleted with all
      57 green — until the plant was made unmistakable (displace the fill by
      1000px), which it caught immediately: the earlier plants simply were not
      the defect its title names. No finding was filed on the suspicion.

## 3. Close

- [x] 3.1 No game was found to have no render coverage worth the name.
- [x] 3.2 Run the full gate.
- [x] 3.3 Archive the change.
