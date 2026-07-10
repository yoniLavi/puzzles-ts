# Change: Dominosa domino-reference panel (learning aid)

## Why

Part of the point of this fork is to help players *pick up* a new puzzle. Dominosa's
core bookkeeping — "the placed set must be exactly the `(n+1)(n+2)/2` distinct
number-pairs, one of each; which have I used up?" — is exactly the paper-and-pencil
tracking a solver does by hand, and today the app forces the player to eyeball an
`(n+2)×(n+1)` clue grid to do it. Dominosa also already ships upstream's number-highlight
aid (right-click a face value to colour every cell showing it), but it is undiscoverable
and only highlights single values, not the pair you are hunting for.

Surface both as one discoverable control: a **domino reference** — a checklist of every
pair with found/outstanding/conflict status (zero solution information; pure inventory
accounting), and, on click, a **pair-occurrence highlight** that boxes the candidate
placements for that domino on the live board.

## What Changes

- **New generic engine capability: a per-game "reference aid".** An optional
  `Game.reference(state, ui)` hook returns a plain `ReferenceModel` (a list of the
  puzzle's fixed inventory of pieces with status), and an optional
  `Game.selectReference(ui, key)` hook spotlights one item by mutating `Ui` (a
  `UI_UPDATE`-shaped change, no history entry). Presence of `reference` drives a static
  `hasReference` attribute. The engine surface gains `getReference()` and
  `selectReference(key)`. This is the first app-shell → `Ui` push channel that is neither
  a synthetic key nor mouse event; it is the clean mechanism the pair-occurrence
  highlight needs.
- **New app-shell control + panel.** A toolbar toggle button next to Hint (shown only when
  `hasReference`) opens a **non-blocking, responsive** `<reference-panel>`: docked beside
  the board on wide viewports, a bottom sheet on narrow ones. In both modes the board stays
  visible and interactive, so the checklist ticks off live as you place dominoes and a
  clicked pair lights up behind/beside the panel.
- **Dominosa implements the aid.** `reference()` enumerates all `DCOUNT(n)` pairs with
  status `outstanding` / `placed` / `conflict` (a value placed twice); `selectReference()`
  sets a new `DominosaUi.highlightPair`; `render.ts` boxes every adjacent cell-pair whose
  two clue values are that domino, in a dedicated colour.

## Impact

- Affected specs: `ts-engine` (ADDED: reference-aid capability + responsive non-blocking
  panel), `dominosa` (ADDED: domino reference checklist + pair-occurrence highlight).
- Affected code: `src/native/engine/game.ts`, `midend.ts`; `src/puzzle/engine-surface.ts`,
  `types.ts`, `worker.ts`, `worker-adapter.ts`, `puzzle.ts`; `src/puzzle/puzzle-history.ts`,
  new `src/components/reference-panel.ts`, `src/screens/puzzle-screen.ts`;
  `src/native/games/dominosa/{state,index,render}.ts`. Tests across tiers 1 / 2.5 / 3.
- Non-goals: generalising the panel to other games now (no second consumer yet — the seam
  is generic but only Dominosa implements it); changing the existing number-highlight aid.
