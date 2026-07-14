# Review the hints we have shipped, and extract the framework they are all re-deriving

> **This change is deliberately high-level.** Its first deliverable is an **audit**, not
> an API. The extraction it proposes is real, but which seams are worth extracting is a
> question this change *answers*, not one it assumes. Read `design.md` before writing
> code: it carries the hypotheses, the decision criteria, and the explicit no-go gate.

## Why

Hints are a core deliberate-divergence product value of this fork, and by now they are
**most of the collection**, not an experiment:

- **37 games ported; 20 of them ship an explained hint.**
- **24 hint-related `fix(...)` commits** in the history — a defect rate that is not
  explained by "hints are hard", because *the same defects keep recurring in new ports*.
- ~1,600 lines of shared hint machinery already exist across seven engine modules
  (`slide-planner`, `candidate-hint`, `latin-hint`, `deduction-fixpoint`, `step-budget`,
  `hint-vocab`, and the cross-game `hint-resume.test.ts` guard) — but adoption is uneven
  (`step-budget`: 13 games; `hint-vocab`: 3), which tells us the sharing happened
  *reactively*, one game noticing another's module, rather than by design.

**The framework already exists. It is just scattered, half-adopted, and re-derived per
game — so every new port re-earns the same bugs.** The recurring classes, each of which
has bitten more than one game:

1. **Marks vs. animation.** Netslide, this session: the hint's tile mark did not travel
   with the moving tile, and its target mark *did* travel with the moving line. The
   pre-move/post-move index question underneath it (`settleHint` advances the plan at
   animation *end*) is identical in Sixteen and Fifteen and in every future sliding game.
2. **Overlay vs. render cache.** An overlay left out of the cache diff key simply never
   appears (playbook §3.2, shipped twice — the hint overlay, then Towers' mistake overlay
   `ds.wrong`). Every game re-derives the cache-key packing that makes this safe.
3. **Plan stability across recompute.** Inertia looped for ever; Netslide ping-ponged.
   The cure (a monotone potential, never a cached plan) is a *design rule in a document*,
   enforced by one shared test, but nothing in the types stops a game getting it wrong.
4. **Keep-track / refresh semantics.** `hintKeepTrack`, `refreshHintStep`,
   `continuesPrevious` journeys, one-hint-per-request: subtle, engine-owned, and each
   game wires them by hand (`fix(towers/hint): never show a stale/illegible step`).
5. **Narration quality.** Six or seven rules in `hint-authoring.md` (indication-first,
   terse, colour legend, degenerate extremes, conclusion matches move type, name what the
   player can see, rules-belong-in-the-help) — all enforced by *review and per-game
   tests*, none by anything structural.
6. **Solver ↔ narrator duplication.** Every deductive game needs "the solver, and the
   solver narrating itself". `latin.ts` has a gated recorder; Solo has a bespoke one;
   Pattern and Undead run *parallel* recorders beside their solvers. Three answers to one
   question, and the [narratable-deduction-engine doctrine](../../specs/) says there should
   be one.

## What Changes

Three phases, with a **decision gate between the first and the second**:

- **Phase 0 — Audit (the real deliverable of this change).** Read all 20 hint
  implementations against the six classes above. Produce a table: which games share what,
  which re-derive what, which bugs each class has actually caused, and what a game would
  have had to write if the seam existed. This is written into `design.md`, in the repo,
  as durable evidence — not held in a session's context.
- **Phase 1 — Decide, per seam.** For each candidate seam, an explicit go/no-go against
  the criteria in `design.md`. **A seam that fails the criteria is written up as a no-go,
  with the reason** — a survey that finds nothing extractable is a *successful* outcome of
  this change, not a failed one.
- **Phase 2 — Extract, one seam and one game at a time.** Each extraction lands with its
  cross-game guard, converts its games, and updates the guides. No game's *deductions* are
  rewritten: what is game-specific (what it can prove, what it marks, what it says) stays
  game-specific. What is *mechanical* (how a plan is carried, how a mark survives an
  animation, how an overlay reaches the cache) moves to the engine.

## Non-goals

- **Not a scene-graph pivot.** The 2026-05-21 withdrawal
  (`openspec/postmortems/2026-05-21-scene-graph-withdrawal.md`) is the precedent to respect,
  and the standing rule from it is: *a framework-level pivot mid-migration needs a real
  downstream game pressuring it, not "it would have prevented the bugs we just fixed."*
  Phase 0 exists to establish whether that pressure is real. The honest difference from the
  scene-graph case: there, one trivially-simple game (Flip) was the only evidence. Here,
  20 games have already shipped and the same defects have recurred across them — the
  pressure is behind us, not hypothesised ahead of us. **Phase 0 must confirm that, or the
  change stops.**
- **Not a rewrite of good per-game hints.** Palisade, Inertia, Towers and Filling are the
  exemplars the bar is written from. They are the *acceptance test* for any extraction: if
  a seam cannot express them without loss, the seam is wrong.
- **Not a new abstraction layer for its own sake.** The measure is bugs prevented and code
  a new port does not have to write, not lines deduplicated.

## Impact

- Specs: `ts-engine` — one new architectural requirement (hint mechanics are engine-owned
  and cross-game-guarded); further deltas decided in Phase 1.
- Code: `src/native/engine/` (the shared hint modules, consolidated), and touching the 20
  games' hint code as each seam is converted.
- Docs: `docs/porting/hint-authoring.md` — today it is ~1,000 lines of *rules a human must
  remember*. Every rule the framework makes structural is a rule the guide can stop
  policing, and the guide should shrink measurably as a result. **That shrinkage is the
  headline success metric of this change.**
