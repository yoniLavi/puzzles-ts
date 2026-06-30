# Pattern drag-paint skips already-placed marks

## Why

A QoL improvement common to other nonogram implementations: when the player
drags to paint a line of cells with either paint button, the drag should fill
only the *blank* cells and leave marks they have already placed untouched, so a
long drag across the board never accidentally rewrites earlier work. Upstream
Pattern overwrites every dragged cell; this is a deliberate divergence (owner-
requested, 2026-06-30).

## What Changes

- A **multi-cell** paint drag (left = Full, right = Empty) only fills cells
  currently `Unknown`. A **single-cell** action (a click) still overwrites, so a
  deliberate click can change an existing mark; a **clear** drag (middle button /
  `Unknown`) still erases marks, since erasing is its purpose.
- Implemented via an `onlyBlank` flag on the `fill` move: `interpretMove` sets it
  on a multi-cell paint drag, `executeMove` honours it, and the drag preview in
  `redraw` matches (previews the new colour only on blank cells).

## Impact

- Affected specs: **`pattern`** (MODIFIED input requirement).
- Affected code: `src/native/games/pattern/{state,index,render}.ts`,
  `pattern.test.ts`. No engine or app-shell change.
