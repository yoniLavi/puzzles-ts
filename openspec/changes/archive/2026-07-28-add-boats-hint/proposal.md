# add-boats-hint

## Why

Boats shipped its native-TS port (`add-boats-ts-port`, accepted 2026-07-28)
**without** an explained hint — per the standing rule that a Palisade-grade
`hint()` is always its own change.

Boats is an unusually good hint candidate. Every one of its four tiers is a
*named, teachable* Battleships technique that a human solver would recognise and
say out loud — "this row already has its three ships, so the rest is water",
"every remaining boat of size 4 has only one run left that can hold it", "if
this square were water the row could not be completed, so it is a ship". The
solver already computes all of it; the hint is a **second projection of the same
deduction engine**, exactly as with Spokes and Bricks. And Boats **guesses at no
tier** (see the `boats` spec), so every step is narratable — there is no
"just because" fallback to design around.

Two things make it *easier* than the recent deductive hints rather than harder:

- **The Hard tier is proof by contradiction, and Boats' validators already
  localise which rule broke and where.** `countShips` returns a per-line status,
  `checkCollision` flags the offending 2×2, `checkFleet` flags an
  over-populated boat's squares and `validateGridClues` flags a contradicted
  given. That is precisely the Bricks pattern (hint-authoring §5.6a′): re-run
  the rejected trial with an error array and read the flags back — **no separate
  recorder needed** for the hardest tier.
- **`findMistakes` is a re-solve**, so the refusal path (hint-authoring §4)
  already distinguishes "you have made a mistake" from "I am stuck", including
  the wrong-but-rule-legal placement a live-only checker would miss.

## A correction to the framing, and where the reuse actually is

This change was requested as reusing (and extracting) hint functionality **from
Crossing**. Crossing ships **no `hint()`** — it has no hint code, no hint entry
in its spec, and is absent from the cross-game hint enrolment
(`testing/hint-games.ts`). So there is nothing hint-shaped in Crossing to reuse.

The instinct behind the request is still right; it points at two different
things, and this proposal splits them:

1. **The genuine shared-abstraction opportunity is in the four *deductive
   x-sheep* hints — Spokes, Bricks, Clusters and Subsets — not Crossing.** All
   four wrote the *same* plan-accumulation loop (clone the board; while the
   status is "incomplete" and the plan is under budget, ask for the next firing,
   stop if there is none, apply it, record it). Boats would be the fifth. That
   loop is extracted here as `engine/hint-plan.ts` (design D7), which is the
   piece this change is genuinely reusing and generalising.
2. **What Crossing *does* have is an inventory-as-input-surface aid** (playbook
   §3.9): its clue list is clickable, and picking a clue ghosts it into every run
   that can still take it. Boats' fleet display is the same shape of thing — a
   fixed inventory of pieces drawn on the board — and "click a boat size, see
   every run that can still hold it" is a compelling aid. But Crossing's own code
   comment records the owner's decision that judging a candidate by constraint
   propagation "belongs to a hint rather than to an input aid", and an aid is not
   a hint. **It is proposed as a separate follow-up change**
   (`add-boats-fleet-aid`) rather than folded in here — see design D8.

## What Changes

- **A recording deduction pass in `solver.ts`** — `deduceBoatsPlan(board, diff)`
  replays the solver one *firing* at a time, emitting an ordered plan in which
  each entry carries the squares it forces, the technique that forced them, and
  the evidence (the line and its number, the run, the boat size, or the
  contradicted trial). `solveBoats` itself is **not touched**: the recording pass
  is a parallel entry point beside it, so the frozen 34-fixture differential
  cannot drift (hint-authoring §5.6a, "parallel, not gated").
- **Tier-ascending replay** — the plan is built by trying each difficulty cap in
  ascending order, exactly as `solveAtAnyTier` does, because Boats' solver is
  **not monotone in its cap** (the `boats` spec requirement). A hint that replayed
  straight at the maximum would stall on ~70% of Easy boards (design D2).
- **`hint()` / `hintKeepTrack()` in `index.ts`** — a narrated `HintResult`, one
  journey per firing, with a firing that forces several squares emitted as one
  multi-leg `continuesPrevious` journey (hint-authoring §5.5) rather than N
  disjoint hints.
- **Hint rendering in `render.ts`** — the forced squares in `COL_HINT`, the
  evidence (the line, the run, the clue) shaded `COL_HINT_CELL`, folded into the
  per-tile cache key and the existing `OverlaySidecar` (playbook §3.2). Boats has
  **two move shapes** — place a boat, place water — so the hint echoes each in
  its own mark (hint-authoring §5.1a): a forced ship draws a ship-shaped hint
  mark, forced water a water-shaped one.
- **`engine/hint-plan.ts`** — the shared plan-accumulation loop described above,
  with Spokes / Bricks / Clusters / Subsets refactored onto it. Each refactor is
  behaviour-preserving and is proved so by its existing hint tests staying green
  (design D7).
- **Tests** — `boats-hint.test.ts` (one narration test per tier, multi-leg
  grouping, the three refusals, a tier-2.5 hint frame) plus enrolment in
  `testing/hint-games.ts`, which brings the cross-game hint-overlay, hint-resume
  and hint-quality guards along for free.

Explicitly **not** in this change:

- **The fleet-list aid** (click a boat size → ghost it into every run that can
  hold it). Its own change; see D8.
- **Any change to `solveBoats`, the generator, or the codec.** The differential
  is frozen and C-free now, so a divergence there would be undetectable — the
  recording pass stays strictly parallel.

## Impact

- Affected specs: `boats` (a hint requirement), `ts-engine` (no change — the
  hint mechanics are already generic).
- Affected code: `src/native/games/boats/{solver,index,render}.ts`, new
  `src/native/engine/hint-plan.ts`, refactors in
  `src/native/games/{spokes,bricks,clusters,subsets}/solver.ts`, enrolment in
  `src/native/engine/testing/hint-games.ts`.
- No C, no wasm, no generator surface: `boats.c` is already deleted and the
  frozen differential must stay green untouched.
