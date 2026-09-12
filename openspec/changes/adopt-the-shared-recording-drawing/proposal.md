# Eighteen test files record only what their author thought to record

## Why

`src/engine/testing/recording-drawing.ts` exists so a render test can assert
against *every* primitive a game draws, with colors resolved through the palette
and coordinates rounded the same way every time. Measured 2026-09-12 by the
cast: **14 test files hand-roll their own double instead**, as an object literal
cast with `as unknown as GameDrawing` implementing the four or five methods that
test happens to need. (The proposal was scaffolded with 18, keyed on a wider
scan that also caught midend tests passing an inert stub they assert nothing
about — those need no recorder, and the cast is the honest key.)

This is not a tidiness complaint. A hand-rolled double is a silent filter: a game
can start drawing something new, or stop drawing something, and a test that never
recorded that primitive stays green. The tidy pass found uncovered render paths
in several of exactly these games, including plants that survived the entire
suite in Pegs, Guess, Twiddle and Mosaic.

The casts are the visible symptom. Of 109 `as unknown as` casts in `src`, **96
are in test files**, and the doubles are where most of them live.

## What changes

- The 14 files adopt `RecordingDrawing`, dropping their local `Op` types, their
  literal doubles and the casts that made them typecheck.
- Where a test asserted against its double's bespoke op shape, the assertion
  moves to the shared recorder's op shape.
- Any game left without a render test worth the name is recorded, not silently
  skipped.

## What this is expected to surface

Adopting a recorder that captures everything will make some tests see draw calls
they did not before. That is the point, and it is also the risk: a test may need
its assertion tightened rather than merely translated. Each file is its own small
judgment, which is why this is one change with eighteen steps rather than a bulk
rewrite.

Two files are known to be more than a translation, because their doubles record
a reduced op shape the assertions are written against: Mosaic's render test and
Flood's. Those two are worth doing first, as the honest measure of the cost.
