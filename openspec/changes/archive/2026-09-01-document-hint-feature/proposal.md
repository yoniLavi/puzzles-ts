# document-hint-feature

## Why

**The fork's flagship divergence is the one feature its help never mentions.**
Explained hints are a *core deliberate-divergence product value* of this
project, not a nicety — `AGENTS.md` says so, thirty games implement `hint()`,
and the quality bar they meet has its own 2,500-line authoring guide.
`grep -rn -i hint help/*.md` returns **one** line: a parenthetical inside a
Light Up note in `differences.md`.

It is not only hints. `help/features.md` is a genuine, well-maintained features
page — seven sections covering the virtual keyboard, right-click on touch,
right-drag, checkpoints, autosave, sharing, and saved games — and every feature
this fork added beyond upstream is absent from it:

| feature | surfaces | in help? |
|---|---|---|
| Hint (show → apply stepper) | toolbar button, game menu | no |
| Auto-Hint (continuous, 1 s/step) | toolbar play/pause | no |
| Check & Save / Quick-save + Quick-load | toolbar, game menu, Cmd/Ctrl+S | no |
| Mistake highlighting (`findMistakes`, 40 games) | the red overlay | no |
| Fill in all pencil marks (`canMarkAll`, 10 games) | toolbar button | no |
| The reference panel (`reference`, Dominosa) | toolbar button | no |

A player has no way to learn that the Hint button explains *why* a move is
forced rather than just revealing it — which is the entire difference between
this collection and upstream's `'h'`. A touch player has no way at all to learn
what the pencil-grid button does: upstream's answer is the `M` key, and they
have no `M` key.

**And one thing that is documented is now ambiguous.** `features.md`
§Checkpoints describes the *multi-checkpoint history panel*. The one-slot
quick-save is a different feature that ships under **three** names — the button
reads *Check and save* or *Quick-save* depending on the game, and its success
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
- **The cross-game hint legend, stated once** — and it is a legend of **shape**
  before colour: the acted-on thing is *ringed beside* the content and never
  filled over it, the evidence is outlined (or washed where the cells carry
  nothing to read), and a chain's links carry small **ordinals** saying the
  order they fall in, never arrows claiming each forces the next. The legend is
  a real cross-game invariant with a normative home (`ts-engine`'s "element-type
  colour legend", and the mark-shape rule beside it) and nothing tells the
  player it exists.
- **A `## Checking your work` section** for `findMistakes` + Check & Save +
  Quick-load, and the **terminology fix** on the "checkpoint" collision, settled
  by the owner: the quick-save path stops saying "checkpoint" (all four of its
  strings, not just the toast label), leaving that word to the history panel.
- **Short sections for the two remaining fork controls** — filling in every
  pencil mark, and the reference panel. Both ship a toolbar button and neither
  is discoverable any other way.
- **An honest statement of coverage.** Not every game has a hint, and not every
  game can check for mistakes. The page should say what governs that rather
  than implying a button that is sometimes absent.
- **What "Unreasonable" means, in the player's words** (added 2026-08-11 on
  owner request, from `add-galaxies-hint` acceptance). Thirteen games ship a
  tier under that name and nothing tells a player what it promises: *this board
  may reach a position where no deduction is left and the only way on is to try
  something and see*. That is a real contract, normative in `ts-engine` — a
  tier whose boards can require **Search** is named `Unreasonable` and no other
  tier name may be — and it is the difference between a hint that has run out
  and a hint that is broken. Galaxies' hint refuses in exactly that position and
  says so; the help has to have taught the word first.
- **A coverage guard in `src/help-coverage.test.ts`.** The gap existed because
  nothing could notice it. Three derivations, all from the app: every optional
  `Game` capability is classified against a help anchor (fail-closed on a new
  one), the populations the prose asserts are checked against the flags that
  define them, and every `::icon::` the help names resolves to a real rule —
  which today it silently need not. See design.

## Impact

- Affected specs: `repo-layout` (its help-page requirement gains what the
  site-level pages must cover).
- Affected code: `help/features.md`, `help/differences.md`,
  `src/help-coverage.test.ts`, `src/css/help.css` (the glyphs the new prose
  names), `src/icons.ts` (a sync note pointing at a file and symbol that no
  longer exist), and `src/puzzle/quick-save-actions.ts` for the terminology fix.
- **No gameplay change.** Nothing here alters a board, a solver or a hint; this
  change is documentation, the strings that made it ambiguous, and the guard
  that keeps it honest.
