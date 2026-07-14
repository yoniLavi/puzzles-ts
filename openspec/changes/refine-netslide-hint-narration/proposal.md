# Refine Netslide's hint narration

## Why

Owner playtest (2026-07-14) on a 4×4 board: the hint bar is dominated by

> The centre tile can never move, so the network has to be built around it — and
> this corner belongs right beside it: take it to row 2 (setting up).

Measured over 40 fresh boards (593 plan steps, 4×4): that branch fires on **12%**
of steps, but at **146 characters** it is **1.8× the mean step** (82), wraps to two
lines, and therefore reads as if it were on all of them. Shortening it is most of
the win. Three defects sit inside it:

1. **"Centre" is a claim the hint never checked, and it is false on even boards.**
   `state.ts` sets `cx: Math.floor(w / 2)`, so on a 4×4 the immovable tile is row 3,
   column 3 — the player can *see* it is not the centre. The same word is in the
   frozen-line branches ("the centre row never slides"), where naming the row by its
   number is both true on every board and shorter.

2. **The preamble is a rule of the game, not a deduction about the move.** That the
   source cannot move is something the board already shows — no arrows are drawn
   beside its row or column — and the move being narrated does not *follow* from it.
   The genuinely provable, move-specific deduction is the single degree of freedom
   ("row 3 never slides, so this tile can only move along its column"), which fires
   on 17% of steps and does earn its premise. Restating a rule on every step is
   noise; per the hint bar, a hint teaches the *technique*, and the technique here is
   the degree-of-freedom argument.

3. **The sentence contradicts itself and re-narrates the picture.** "…belongs right
   beside it: take it to row 2 **(setting up)**" claims arrival and setting-up at
   once, while `render.ts` already outlines the destination **solid** precisely to
   mean "the finished board wants this tile's wires here".

The help page makes it worse: `puzzles/html/netslide.html` calls the tile "the middle
square" (so the vocabulary does not even match the hint) and **never states the rule
that its row and column cannot be slid** — the one rule the whole game turns on.

## What Changes

- **Netslide's hint drops the "the centre tile can never move" preamble.** A step
  whose tile belongs beside the source says so plainly:
  `This corner belongs beside the source: take it to row 2 (setting up).` (69 chars,
  down from 146).
- **The immovable tile is called *the source*** — the black box power flows from —
  in every player-facing string, never "the centre". Frozen lines are named by
  number: `Row 3 never slides, so only a column move can shift this corner: take it
  to row 2.`
- **The redundant tail is fixed**: a step that both says a tile belongs beside the
  source *and* delivers it there no longer ends ", where it belongs".
- **The help page teaches the vocabulary and the rule it omitted**: names the source,
  and states that the source's row and column never slide.
- **`hint-authoring.md`** gains the two transferable lessons: name board elements as
  the player can see or count them (never a geometric claim that is false on some
  board sizes), and keep the *rules* of the game out of the per-step narration —
  a hint states what makes *this move* follow, and the rulebook lives in the help.

## Impact

- Specs: `netslide` — the hint requirement's narration bullet is modified.
- Code: `src/native/games/netslide/hint.ts`, `netslide-hint.test.ts`.
- Docs: `puzzles/html/netslide.html` (ours to maintain — Netslide's C is deleted),
  `docs/porting/hint-authoring.md`.
- No engine, planner, render or save-format change: the plan and the marks it draws
  are untouched. This is narration only.
