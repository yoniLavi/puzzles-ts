# refine-slide-appearance

## Why

**Slide's author left three specific complaints about how it looks, and the port
reproduced all three faithfully.** `unfinished/slide.c`'s TODO block:

> *"Improve the graphics.*
> * *All the colours are a bit wishy-washy. Some dark colours would surely not be
>   excessive? Probably darken the tiles, the walls and the main block, and leave
>   the target marker pale.*
> * *The cattle grid effect is still disgusting. Think of something completely
>   different.*
> * *The highlight for next-piece-to-move in the solver is excessive, and the
>   shadow blends in too well with the piece lowlights."*

`add-slide-ts-port` (F9) confirmed each on screen and put them to the owner
rather than deciding them inside a port: walls, ordinary blocks and the floor all
derive from the one host background and are told apart only by their bevels; the
"cattle grid" is the crosshatch beside the target; the solver's next block is
painted `COL_HIGHLIGHT`, i.e. pure white on a light host. The owner answered one
part — **the target green stays** (2026-07-30), since the repo's one shared
region colour means something else and Slide's blocks are already
background-coloured. The other two were left open, and display work is explicitly
in this fork's scope (`feedback_byte_parity_scope`: display was never a parity
surface).

## Sequencing (owner decision, 2026-08-01)

**Waits for `retire-c-engine`**, and possibly for a round or two of refactoring
after it, so this lands on a TypeScript-only codebase. Nothing here needs the C
build.

## What Changes

- **Give the board some contrast.** Walls, ordinary blocks and the floor stop
  being three shades of one background separated only by bevels. Note the
  author's instruction is a *pair*: darken the tiles, walls and main block and
  leave the target pale — raising the contrast of everything else is what lets
  the green stop carrying the whole board, so this subsumes the "green is loud"
  observation without touching the green.
- **Replace the crosshatch** marking the exit with something legible at small
  tile sizes.
- **Bring the solver's next-piece highlight down** from pure white to a mark that
  reads as "next" rather than as a light source.
- **Both schemes, per the palette rules.** Colours come from
  `engine/colours.ts` / `palette.ts`, and "brightest" is scheme-relative — a
  change that reads as contrast in light mode must not read as a bright patch in
  dark (`hand-author-dark-palette` F1, and the Light Up regression the dark check
  caught). Slide's dark handling currently runs through `paletteSwaps` in
  `augmentation.ts`, which any new colour has to keep working.

## Impact

- Affected specs: `slide` (a presentation requirement).
- Affected code: `src/games/slide/render.ts`, possibly `palette-games.ts`
  and `src/puzzle/augmentation.ts`.
- Display only — no board, description or solver behaviour changes.
