# Tasks — Pattern drag-paint skips placed marks

- [x] 1. Add an optional `onlyBlank` flag to the `fill` `PatternMove`; `executeMove`
      skips non-`Unknown` cells when it is set (immutable cells still always skipped).
- [x] 2. `interpretMove` release path sets `onlyBlank` on a multi-cell paint drag
      (`value !== Unknown`), and computes "move needed" against the blank-only fill.
- [x] 3. `redraw` drag preview shows the paint colour only on blank cells for a
      multi-cell paint drag, so the preview matches the emitted move.
- [x] 4. Tests: an `onlyBlank` fill leaves placed marks but fills blanks; a single
      cell still overwrites; a clear drag still erases; `interpretMove` flags a
      multi-cell drag `onlyBlank` and a single cell not.
- [x] 5. Gate green; dev-verify the drag in the browser; commit + archive.
