# Design

## Where the helper lives

`src/engine/draw.ts`, beside the other shared drawing helpers the catalog already
names, `drawThickRectOutline` and the recessed-border helper. Not a new module: a
one-function file would add an import path for no reason, and the engine is
deliberately a flat namespace of helpers.

The engine-catalog check in the gate requires every shared engine module to be
named in `docs/games/engine-catalog.md`. Adding a function to an existing module
keeps that satisfied, and the catalog entry for `draw.ts` gains a line.

## The signature is the size, nothing else

    glyphFont(size: number): DrawTextOptions

Rejected: a helper that also takes the alignment or the font type. The moment it
takes options it stops being the answer to one question, and each call site has
to be read to see which variant it asked for. The value here is that the call
site says *centered glyph at this size* and nothing else.

## Verifying a 43-file mechanical edit

By shape, not by a green suite. Every removed line matches one of two known
forms, and every added line is a `glyphFont(` call. Assert that over the whole
diff, then read only the exceptions. A suite is green either way if a site was
missed; the shape check is what proves none was.

The render snapshots do the behavioral half. A glyph whose options changed draws
differently, so a site that was not identical to the canonical literal fails
rather than passing quietly.

## Order of work

Take the sites in one pass, not per game. The per-game commit shape belonged to
the tidy pass, where each game's tests were the unit of verification. Here the
unit is the helper plus its call sites, and splitting it 43 ways would leave the
tree half-migrated between commits for no gain.
