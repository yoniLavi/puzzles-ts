# Adopt one narratable deduction engine per logic game

## Why

Two structural facts have accumulated across the ported logic games:

1. **The deductive solver and the explained hint want to be the same engine.**
   Most ported games already run *one* engine: a gated recorder threads through
   the solver the generator uses, so every deduction is both a
   generation/grading step and a narratable hint step (Range, Singles, Filling,
   Unruly, and the Latin family via `latin.ts`). A minority run a *second*,
   parallel engine for the hint (Pattern, Undead) — justified only when the
   solver's method is not itself teachable, or is trivially cheap to re-run.
   Either way, each game **hand-rolls the same fixpoint plumbing**: an
   ordered-rung loop, a difficulty cap, recorder threading, a group-id-per-firing
   bump, "return after the first firing on the recording path."

2. **One game (Pattern) ships a generic "just because" hint fallback.** When its
   named techniques (overlap, unreachable) don't cover a forced cell (~0.03% of
   steps, measured), the hint emits an unexplained *"only one arrangement fits"*
   step. That step cannot explain *why* the move is forced, so it fails hint
   quality-bar rule 1 (hint-authoring §1). The threaded games never have this —
   they narrate every firing.

Owner decisions (2026-07-01): (a) unify solver + hint into one narratable engine
per logic game and treat that as the standing approach for all future ports;
(b) **reject** generated boards a game's narratable techniques cannot solve
(except an explicitly-named `Unreasonable` tier) rather than fall back to an
unexplained step — "no game falls back to *just because*."

## What Changes

- **Phase 1 — shared scaffold (mechanical, no behaviour change).** Extract a
  reusable `runDeductionFixpoint({ rungs, maxRung, recorder })` in
  `src/native/engine/` and converge the games that hand-roll the loop
  (Filling, Pattern, Undead, and the `latin.ts` core) onto it. Pure refactor;
  the differentials and behavioural suites stay green.
- **Phase 2 — the generation policy (spec).** Add a standing requirement: **every
  non-`Unreasonable` board a logic game generates SHALL be solvable by the same
  narratable techniques its hint teaches, and a hint SHALL never emit an
  unexplained "fallback" step.** Two compliant strategies, chosen per game by
  cost: **narrate every deduction the gate accepts** (promote any catch-all into
  an honest technique — Filling's non-local narration, §5.6), or **reject at
  generation** what the techniques cannot narrate. Add the companion Hint-System
  rule (no un-narrated step) to `ts-engine`.
- **Phase 3 — staged per-game flip (own follow-on changes).** Flip each game onto
  the gate behind a **rejection-rate + difficulty-regrade measurement** (a flip
  that thins a size/tier or spikes generation time is not free). The first target
  is Pattern: remove its generic fallback, and choose per the measured cost
  between *rejecting* the ~0.03% (retires the placement-enumeration `doRow`
  solver, but forfeits the byte-match differential — acceptable, C is deleted) or
  *promoting* the intersection into an honest technique (keeps byte-match, at a
  more tedious narration). Audit the threaded games to confirm they already
  comply.

This change delivers Phase 1 + Phase 2. Phase 3 flips are enumerated as roadmap
and land as their own parity-gated changes.

## Impact

- Affected specs: **`ts-engine`** (ADD shared deduction-fixpoint scaffold; ADD
  "a hint step always names a technique — no un-narrated fallback"),
  **`ts-migration`** (ADD the narratable-deduction generation policy).
- Affected code (Phase 1 only): new `src/native/engine/deduction-fixpoint.ts`;
  `filling/solver.ts`, `pattern/solver.ts`, `undead/solver.ts`, `engine/latin.ts`
  converge onto it. No generated-board or narration change in this change.
- Phase 3 per-game flips (including Pattern's fallback removal and any byte-match
  differential retirement) are **out of scope here** — each is its own change so
  its rejection-rate/regrade measurement and board-identity change are reviewed in
  isolation.
