# Proposal: Hint System

**Status**: Proposed

## Context

Flip's solve-as-hint-mask works for that game (independent cell flips shown all at once), but most games have sequential solutions where the right next move depends on what came before. Showing the entire solution upfront is overwhelming; showing the next step with a reason is genuinely helpful.

Currently the app has a single "Solve" button. We want two:

- **Solve** — show the entire solution (existing behaviour, enhanced per-game)
- **Hint** — show just the next right step, with a human-readable explanation

## Why now

Sixteen is the first port where we can design this from scratch rather than retrofitting. It's also simple enough that a heuristic hint is straightforward (find an out-of-place tile, suggest a slide that moves it closer). The design should generalise to all games, but Sixteen is the first consumer.

## Scope

- New `hint()` method on the `Game` interface (optional)
- New `HintResult<Move>` type
- Midend: `hint()` entry point, hint state stored in midend (not game state)
- Rendering: midend passes hint to `redraw` so games can display it
- UI: two buttons (Solve + Hint) instead of one
- Sixteen: first game with a `hint()` implementation (heuristic)

## Out of scope

- No changes to Flip's existing solve behaviour (it works well as-is)
- No retroactive `hint()` implementations for other games (those come later)
- No optimal solvers — heuristic "good next step" is sufficient
