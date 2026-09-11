## 1. Measure the cost on the two hardest first

- [ ] 1.1 Migrate Mosaic's and Flood's render tests to `RecordingDrawing`, and
      for each, plant the defect the test's title names, see it red, restore.
- [ ] 1.2 Record what the migration cost per file, and whether any assertion had
      to be tightened rather than translated.

## 2. The remaining sixteen

- [ ] 2.1 Migrate the rest, one file at a time, each with the plant-and-restore
      check from 1.1.
- [ ] 2.2 Delete the local `Op` types, the literal doubles and the
      `as unknown as GameDrawing` casts they required. Verify the count of such
      casts in `src/games` falls to zero.
- [ ] 2.3 Verify the test count is unchanged, no snapshot is re-recorded, and any
      new snapshot is one a reviewer would actually read.

## 3. Close

- [ ] 3.1 Record any game found to have no render coverage worth the name, rather
      than leaving it implied.
- [ ] 3.2 Run the full gate.
- [ ] 3.3 Archive the change.
