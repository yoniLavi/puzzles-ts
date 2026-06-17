# Proposal: Port Unruly to native TypeScript

**Status**: Proposed

## Why

Unruly (binary / Binairo) is port #15 — the simplest-first next game and the
**battle-test for the provisional dev guides** (`add-game-dev-guides`). It is a
clean grid-fill puzzle with no long-tail-risk entanglements (no
`midend_supersede_game_desc`, no undo-by-state-equality, no `#ifdef EDITOR`
input letters), a small purely-deductive solver, and trivial black/white
rendering — ideal for executing the playbook end-to-end and fixing whatever the
guide failed to tell a porter.

## What Changes

- **New `src/native/games/unruly/` port** implementing
  `Game<UnrulyParams, UnrulyState, UnrulyMove, UnrulyUi, UnrulyDrawState>`:
  `state.ts` (params, run-length desc codec, the three-state cell grid, moves,
  completion), `solver.ts` (the four deductive techniques — impending-threes,
  single-gap, complete-count, near-complete — plus the optional unique-rows
  technique), `generator.ts` (random fill then clue winnowing with a
  difficulty floor), `render.ts` (palette mirroring the C colour-enum indices so
  the existing dark-mode `paletteOverrides` keep working, `Int32Array` packed
  cache, completion flash, 3-in-a-row / count / unique-match error overlays,
  immutable-clue bevel, keyboard cursor), `index.ts` (`Game` glue +
  `interpretMove` + `registerGame`).
- **`findMistakes` (Check & Save).** Unruly re-solves from its immutable clues
  to the unique solution and flags every player mark that contradicts it, so the
  shipped Check & Save control hard-blocks a wrong board (a solvable game without
  this silently saves mistakes — the gap that surfaced on owner smoke-test).
- **New shared helper `mkhighlightSpecific(base)`** in
  `src/native/engine/colour-mkhighlight.ts` — a faithful port of
  `misc.c`'s `game_mkhighlight_specific`, which (unlike the existing
  `mkhighlight(bg)`) extrapolates the *base* colour when it sits within `K` of
  white/black. Unruly's near-white `COL_0` (0.95 grey) triggers exactly this
  path, so a faithful port needs it; future white/black-tile games that derive
  highlight/lowlight from a non-background base reuse it.
- **Stage-1 registration only.** Add `unruly` to `ts-ported-ids.ts` and import
  it in `games/index.ts` so the TS impl serves it for owner smoke-testing. The
  `TS_PORTED` flag + `puzzles/unruly.c` deletion happen **only on owner
  acceptance**, per the two-stage parity gate.
- **Dev-guide battle-test.** Every gap or wrong step the playbook surfaces while
  following it is fixed in `docs/porting/game-port-playbook.md` in the
  `add-game-dev-guides` change (its task 6), not here.

## Impact

- **Affected specs:** new `unruly` capability (ADDED requirements: Game
  interface, desc codec, generator, solver, marking moves, error/flash
  rendering, mistake-checking).
- **Affected code:** new `src/native/games/unruly/*`; `mkhighlightSpecific` added
  to `colour-mkhighlight.ts`; one line each in `ts-ported-ids.ts` and
  `games/index.ts`. No change to `unruly.c` until owner acceptance (stage 2).

## Follow-ups (owner-requested 2026-06-17)

These are flagged here for continuity but are **their own changes**, not part of
this port:

1. **In-process testing of shell controls (remove the Playwright dependency for
   buttons).** Verifying Check & Save / Hint / Quick-load today still means
   driving the real toolbar in Playwright, because those controls live in
   shadow-DOM web components (`puzzle-history.ts`) wired through
   `quick-save-actions.ts` — the existing tier-3 `puzzle-screen.test.ts` exercises
   the command path only against a *fake* `Puzzle`. Explore an instrumentation
   layer that binds a **real `Midend`-backed `Puzzle`** (as `renderScenario`
   already builds) to the shell command handlers under happy-dom, so a test can
   invoke "Check & Save" against a real game and assert the refusal modal /
   success toast / mistake-highlight overlay in vitest. Likely a new
   `repo-layout` test-harness change; would have let this port's `findMistakes`
   refusal be asserted in-process instead of by hand. Scope before port #16.

2. **Explained `hint()` for Unruly.** The deductive solver (the five techniques)
   already produces a per-cell *reason*, making Unruly a strong hint candidate at
   the Palisade quality bar — narrate *why* each cell is forced (impending-three,
   single-gap, completed-count, unique-row, near-complete). A separate
   `add-unruly-hint` change per the hint-authoring guide; to be designed in a
   follow-up session.

## Out of scope

- The optional unique-rows variant is supported in params/solver/render exactly
  as upstream, but is not added to the default presets (upstream doesn't either).
