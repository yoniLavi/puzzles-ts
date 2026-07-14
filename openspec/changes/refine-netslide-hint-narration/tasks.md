# Tasks

## 1. Narration

- [x] 1.1 `hint.ts`: rename the immovable tile to **the source** in every
      player-facing string; drop "centre" from the module and function docs.
- [x] 1.2 `hint.ts`: frozen-line branches name the line by number — `Row 3 never
      slides, so only a column move can shift this corner: take it to row 2.`
- [x] 1.3 `hint.ts`: the beside-source branch loses its preamble —
      `This corner belongs beside the source: take it to row 2 (setting up).` — and
      its tail no longer says "where it belongs" twice when the slide arrives.
- [x] 1.4 `hint.ts`: rename `isBesideCentre` → `isBesideSource`.

## 2. Tests

- [x] 2.1 `netslide-hint.test.ts`: update the frozen-line assertions to the new
      wording, and assert the new sentence is *shorter* than the mean step it
      replaced (a regression guard on the thing that was actually wrong).
- [x] 2.2 Assert no player-facing Netslide hint string says "centre".
- [x] 2.3 Assert a step that both belongs-beside-the-source and arrives does not say
      "belongs" twice.
- [x] 2.4 Re-baseline any render/hint snapshots the wording touches.

## 3. Help

- [x] 3.1 `puzzles/html/netslide.html`: name the source, and state the rule the page
      omits — the source's row and column never slide.

## 4. Guides

- [x] 4.1 `docs/porting/hint-authoring.md`: name board elements as the player can see
      or count them; never a geometric claim that is false at some board size.
- [x] 4.2 `docs/porting/hint-authoring.md`: the rules of the game belong in the help,
      not in every hint step — a per-step premise must be what makes *this move*
      follow.

## 5. Gate

- [x] 5.1 `tsc -b --noEmit` → `biome lint` → `vitest run` → `vite build`.
- [x] 5.2 Dev-verify in the browser: hints on a 4×4 read short, say "source", and
      never say "centre".
- [x] 5.3 `openspec validate refine-netslide-hint-narration --strict`.
