# One centered-glyph text option, not sixty

## Why

Every game that draws a digit or a letter into a tile writes the same object:

    { align: "center", baseline: "mathematical", fontType: "variable", size }

Measured 2026-09-12 across `src/games`: **60 occurrences in 43 files**, and 63
lines carrying the `mathematical` baseline. Exactly one game, Salad, has pulled
it into a local helper, which is the shape this change generalizes:

    function glyphFont(size: number): DrawTextOptions {
      return { align: "center", baseline: "mathematical", fontType: "variable", size };
    }

This is the cheapest real extraction the tidy pass surfaced. It is mechanical, it
has no per-game variation to preserve, and it passes the repository's test for
whether a decision is genuine: no game would legitimately want a *different*
answer to "how is a glyph centered in a tile". They all want the same one, and
43 files currently answer it separately.

## What changes

- `src/engine/draw.ts` gains a `glyphFont(size)` helper returning the centered
  variable-font options, named in `docs/games/engine-catalog.md` as the gate's
  catalog check requires.
- The 60 call sites adopt it.
- Salad's local copy is deleted in favor of the shared one.

## Why it is safe to do in bulk

The helper returns a literal, so the change is textual and its correctness is
checkable by shape rather than by reading 43 diffs: every removed line is one of
two known forms, and every added line is a call. That is the bulk-edit
discipline `AGENTS.md` § "Method" requires, and it is what makes a 43-file diff
reviewable at all.

The render snapshots are the net. A centered glyph that moves by a pixel changes
the recorded draw ops, so any site that was not in fact identical fails
immediately and visibly.

## What this does not do

It does not touch the other repeated text-option shapes, such as the
`fontType: "fixed"` variants or the left-aligned status text. Those have real
variation between games, and lumping them in would turn a mechanical change into
a judgment call per site.
