# document-hint-feature

## Why

**The fork's flagship divergence is the one feature its help never mentions.**
Explained hints are a *core deliberate-divergence product value* of this
project, not a nicety — `AGENTS.md` says so, twenty-nine games implement
`hint()`, and the quality bar they meet has its own 2,200-line authoring guide.
`grep -rn -i hint help/*.md` returns **one** line: a parenthetical inside a
Light Up note in `differences.md`.

It is not only hints. `help/features.md` is a genuine, well-maintained features
page — seven sections covering the virtual keyboard, right-click on touch,
right-drag, checkpoints, autosave, sharing, and saved games — and **four**
shipped features this fork added are absent from it:

| feature | surfaces | in help? |
|---|---|---|
| Hint (show → apply stepper) | toolbar button, game menu | no |
| Auto-Hint (continuous, 1 s/step) | toolbar play/pause | no |
| Check & Save / Quick-save + Quick-load | toolbar, game menu, Cmd/Ctrl+S | no |
| Mistake highlighting (`findMistakes`, 36 games) | the red overlay | no |

A player has no way to learn that the Hint button explains *why* a move is
forced rather than just revealing it — which is the entire difference between
this collection and upstream's `'h'`.

**And one thing that is documented is now ambiguous.** `features.md`
§Checkpoints describes the *multi-checkpoint history panel*. The one-slot
quick-save is a different feature that ships under **three** names — the button
reads *Check & save* or *Quick-save* depending on the game, and its success
toast says *"Checkpoint saved"*. A player who reads §Checkpoints and then sees
that toast has been told two things about one word.

Found while writing `add-sticks-hint` (2026-08-06), whose §2.8 task is "the help
must teach any vocabulary the hint introduces". That change fixed Sticks' own
page and deliberately left this: it is collection-wide, and widening a per-game
hint change into a features-page rewrite is scope creep, not diligence.

## What Changes

- **A `## Hints` section in `help/features.md`** covering what a hint *is* here
  (an explanation, not a reveal), the show → apply stepper rhythm, Auto-Hint,
  and that a hint **refuses** on a contradictory board and lights the offending
  squares instead of deducing from a wrong position.
- **The cross-game colour legend, stated once.** Blue is "the hint acts here"
  in every game that has one; the evidence wash is "this is what it is
  reasoning from". The legend is a real cross-game invariant with a normative
  home (`ts-engine`'s "element-type colour legend") and nothing tells the
  player it exists.
- **A `## Checking your work` section** for `findMistakes` + Check & Save +
  Quick-load, and a **terminology decision** on the "checkpoint" collision —
  either the toast stops saying "Checkpoint" or §Checkpoints is disambiguated.
  Naming it is part of this change; which way it goes is a design call.
- **An honest statement of coverage.** Not every game has a hint, and not every
  game can check for mistakes. The page should say what governs that rather
  than implying a button that is sometimes absent.
- **A coverage guard in `src/help-coverage.test.ts`.** The gap existed because
  nothing could notice it. A feature the app ships a *control* for, with no help
  section, is the checkable form — see design.

## Impact

- Affected specs: `repo-layout` (its help-page requirement gains what the
  site-level pages must cover).
- Affected code: `help/features.md`, possibly `help/differences.md`, and
  `src/help-coverage.test.ts`. A terminology fix may touch
  `src/puzzle/quick-save-actions.ts`.
- **No gameplay change.** Nothing here alters a board, a solver or a hint; this
  change is documentation plus the guard that keeps it honest.
