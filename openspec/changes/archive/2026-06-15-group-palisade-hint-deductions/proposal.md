# Group Palisade hint deductions into multi-leg journeys

## Why

Palisade's deduction hint surfaces **one forced edge per step**, even when a
single deduction forces several edges at once. The two cases:

- `equivalentEdges` forces a **coupled pair** ("both edges border the same
  region, so neither can be a wall"). Today they appear as two unrelated hints.
  Worse, the narration omits the rule's actual content — the "the two edges
  must share a fate" coupling — so the leap from "clue 2 can't wall off both"
  to "this edge can't be a wall" reads as a non-sequitur. An owner could not
  understand the frame.
- `numberExhausted` forces **2–3 edges** from one clue ("clue 2 already has its
  walls, so its remaining edges are all open"). Today these are disjoint steps too.

The midend already supports presenting several steps as **one journey** — the
`continuesPrevious` flag keeps the display on through the legs and auto-hint
animates them back-to-back (Sixteen and Fifteen already use it). Palisade simply
isn't emitting grouped steps. We adopt that existing capability so a single
deduction reads — and plays — as one "do both/all" hint, and we fix the
`equivalentEdges` narration to state the coupling.

## What Changes

- **Palisade solver** (`solver.ts`): tag each forced edge with the **firing**
  that produced it (a single logical deduction). `equivalentEdges` records its
  pair under one firing; each `numberExhausted` multi-edge sweep records its
  edges under one firing; single-edge rules each get their own firing.
- **Palisade hint** (`index.ts`): build the plan by grouping a firing's edges
  into one journey — the first leg carries the full narration and shows the
  whole set (action edge + the firing's other edges), continuation legs are
  flagged `continuesPrevious` with abbreviated narration. Rework the
  `equivalentEdges` and `numberExhausted` narration to state the "share a fate"
  coupling concisely and order-agnostically ("so neither can be a wall").
- **Palisade render** (`render.ts`): a firing's edges all share a fate, so they
  all paint `COL_HINT` (blue). Delete the orange `COL_HINT_SIBLING` colour and
  its `sibCache` sidecar — introduced when one deduction had a single action
  edge and the others were mere context; with grouping both edges are acted on,
  so a distinct colour would mislead.
- **Cross-game convention** (`ts-engine` spec): codify "a single deduction
  firing that forces N moves SHALL be emitted as one `continuesPrevious`
  journey" as the hint-authoring convention, so future ports group by default
  rather than re-deciding per game.
- **Uniform auto-hint pacing** (`puzzle.ts`): the auto-hint loop now dwells a
  single shared constant `AUTO_HINT_STEP_MS` (1s) per step — never shorter than
  the move's own slow-motion animation — instead of `animMs + 100`. This makes
  the grouped Palisade journey (whose edge edits don't animate) play at a
  readable pace and gives every game the same per-step feel. It **supersedes**
  the per-game pacing of `d6d6d51` (which let Fifteen run faster at ~0.43s);
  the owner chose uniform 1s while testing this change.
- No engine/`Midend` code change — the journey mechanism already exists.

## Impact

- Affected specs: `palisade` (MODIFIED: the deduction-hint requirement),
  `ts-engine` (MODIFIED: the Hint System requirement gains the grouping
  convention).
- Affected code: `src/native/games/palisade/{solver,index}.ts`; tests in
  `palisade.test.ts` and `palisade-render-scenario.test.ts` (the scenario scan
  tightens to target the `equivalentEdges` region frame specifically now that
  `numberExhausted` frames also carry siblings).
- No behavioural change to `solve`, `findMistakes`, or generation (the firing
  tag is recorded only on the hint path, exactly like the existing evidence).
- User-visible: the flagged frame becomes a single coherent "both edges can't
  be walls — clear this one, then the other" hint that auto-hint plays as a
  multi-part move.
