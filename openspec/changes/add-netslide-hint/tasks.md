# Tasks — add-netslide-hint

> Read [`docs/porting/hint-authoring.md`](../../../docs/porting/hint-authoring.md)
> first, and update it with whatever this change teaches (the live-wiki rule).
> The exemplars to hold in view: **Palisade** (the deduction bar), **Inertia** (the
> non-deductive bar — lead with what you can prove, hold a stable subgoal), and
> **Sixteen** (the planner this change generalises).

## 1. Extract the shared slide planner (D3)

- [ ] 1.1 `src/native/engine/slide-planner.ts`: lift Sixteen's planner —
      bucket-queue A* with lazy node allocation, the **no-progress gate**, the
      exact bidirectional BFS fallback, the partial-plan return, and the
      toroidal distance / slide primitives. Parameterise on `legalMoves`,
      `homes`, `goalReached`, and the heuristic scaling; keep everything else
      identical.
- [ ] 1.2 Refactor `sixteen/index.ts` onto it. **Behaviour-preserving**: its
      existing hint tests, its render snapshot and `hint-resume.test.ts` must all
      pass **unchanged** (no `-u`), and `__lastHintEngagedFallback()` must still
      report the gate engaging only at a strict local minimum.
- [ ] 1.3 Tier-1 tests for the planner itself, against a trivial synthetic game
      (a small grid with known homes): finds an optimal plan on a
      one-slide-from-solved board; returns a partial plan when the budget runs
      out; the no-progress gate engages the exact fallback only at a strict local
      minimum. Seed-deterministic, explicit timeouts, never assert elapsed time
      (playbook §5.2).
- [ ] 1.4 **Decision checkpoint (D3 escape hatch).** If parameterising turned the
      planner into a callback thicket, abandon the extraction: revert Sixteen,
      give Netslide its own planner, share only `hint-vocab.ts`. **Record which
      way it went, and why, in this design.md** — a recorded "we tried and it
      wasn't worth it" is a successful outcome of this task, not a failure.

## 2. Netslide's target and home assignment (D2, D5)

- [ ] 2.1 A pure, deterministic `assignHomes(state, aux)`: label the current
      pieces by cell and assign each to a target cell whose `aux` mask matches,
      minimising total toroidal distance, with an **explicit tie-break** so the
      same board always yields the same assignment (D5 — this is the
      recompute-stability requirement, not a preference).
- [ ] 2.2 Tier-1 tests: every piece is assigned to a mask-compatible cell; the
      assignment is a bijection; **the same board always yields the identical
      assignment** (the stability property, asserted directly); a board already at
      `aux` assigns every piece to where it already is.

## 3. `hint()` + `hintKeepTrack()` (D1, D4, D6)

- [ ] 3.1 `hint(state, aux)`: refuse with `"Solution not known for this puzzle"`
      when there is no `aux` (D1); otherwise assign homes, plan, and emit a
      narrated multi-step plan. Goal test is `isComplete`, **not** equality with
      `aux` (D2) — a board the player wins by another route must be recognised as
      won.
- [ ] 3.2 Narration (D6): lead with the provable fact (the centre tile can never
      move; a centre-row piece has a single degree of freedom); narrate each move
      by its actual consequence — **placing a piece in its final home vs setting
      up** — reusing `HINT_SETTING_UP` / `workingOn` from
      [`engine/hint-vocab.ts`](../../../src/native/engine/hint-vocab.ts). One
      subgoal = one multi-leg journey via `continuesPrevious`. Claim nothing the
      code has not checked ("this piece belongs here", never "this is the only
      place it can go").
- [ ] 3.3 `hintKeepTrack`: a slide of the hinted line that lands the piece where
      the step intended is `"completed"`; progress toward it is `"onTrack"`;
      anything else is `"off"`. Return `"off"` when in doubt.
- [ ] 3.4 Tier-1 tests: a one-move-from-solved board yields a one-step plan whose
      move solves it; auto-playing a whole plan from a real `Midend` reaches a
      solved board; a board with no `aux` refuses with the same sentence `solve`
      uses; every emitted explanation is non-empty and names a consequence.

## 4. Recompute stability (D5) — the Inertia guard

- [ ] 4.1 Add `netslideGame` to
      [`engine/hint-resume.test.ts`](../../../src/native/engine/hint-resume.test.ts).
- [ ] 4.2 A netslide-specific stability test: from a mid-game board, take the
      hint's subgoal; play a *different* legal move; re-request the hint; assert
      the subgoal has **not** flipped to an unrelated piece (the Inertia
      north-east-then-south-west failure). Do **not** fix an instability by
      caching the plan — that hides it (D5).

## 5. Render (D7)

- [ ] 5.1 `render.ts`: hint colours appended past the C enum (netslide has no
      dark-mode `paletteOverrides`); highlight the piece being placed, border its
      destination, draw the slide arrow to press in `COL_HINT`, preview an
      ultimate destination distinctly from an intermediate leg.
- [ ] 5.2 **The hint overlay must be in the render cache's diff key** or it will
      silently fail to repaint (playbook §3.2 — the bug Towers shipped). Guard it
      with a test that redraws the *same* drawstate twice — paint, then request a
      hint, then redraw — and asserts the highlight appears on the **second**
      paint.
- [ ] 5.3 Tier-2.5 `renderScenario({ …, showHint: true })`: targeted assertions
      (a `COL_HINT` highlight on the piece, a `COL_HINT` arrow) plus
      `toMatchSnapshot`.

## 6. Close out

- [ ] 6.1 Full gate green (`tsc -b --noEmit` → `biome lint` → `vitest run` →
      `vite build`); `openspec validate --strict`. Format only this change's files
      (playbook §7 — never a repo-wide `npm run check`).
- [ ] 6.2 Dev-verify in the browser: request a hint, follow it manually, let
      Auto-Hint play a plan out to a solved board, check the narration reads as
      *why* and not merely *what*, and confirm 0 console errors.
- [ ] 6.3 Update [`docs/porting/hint-authoring.md`](../../../docs/porting/hint-authoring.md)
      with what this taught — at minimum a "sliding-permutation games" section
      pointing at the shared planner, and the home-vs-helper narration pattern.
- [ ] 6.4 Owner acceptance, then `openspec archive add-netslide-hint --yes`.

## Follow-up this change deliberately does NOT do

- **Lifting Fifteen/Sixteen's narration** to the same home-vs-helper standard
  (the `AGENTS.md` aspirational note). This change makes that cheap by putting the
  vocabulary and the planner in shared code, but doing it is its own change.
- **Reconstructing the target without `aux`** (D1), which would let a loaded save
  be hinted. That is a new solver and its own change.
