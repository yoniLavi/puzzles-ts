# Proposal: Strengthen Undead's deductive solver so its shipped tiers are guess-free

**Status**: Proposed (design only — implementation in a follow-up session)

## Why

The fork's generation policy (owner decision 2026-06-24, documented in
`docs/porting/hint-authoring.md` §1A) is: **every difficulty tier a logic puzzle
ships must be solvable by pure deduction (no guessing/backtracking), with the sole
sanctioned exception of a tier explicitly named "Unreasonable".** This is the
precondition for an explained hint to exist at all — a hint that has to reveal the
known solution or run a backtracking search isn't teaching a *why*.

Undead violates this today. Its solver has only **two rungs** — `solveIterative`
(per-sightline arc-consistency) and `solveBruteforce` (full backtracking) — with
nothing between them, so its difficulty is graded by *how much brute force a board
needs* (`generator.ts:316-338`). Measured over the current generator (120 boards per
tier):

| tier | boards NOT solvable by arc-consistency alone | residual ambiguity |
| --- | --- | --- |
| 4×4 Normal | 89% | mostly 3 cells |
| 4×4 Tricky | 100% (by definition) | 4–8 cells |
| 5×5 Normal | 73% | mostly 3 cells |
| 5×5 Tricky | 100% (by definition) | 4–10 cells |
| 7×7 Normal | 21% | 1–3 cells |

So a large fraction of currently-shipped Normal/Tricky boards require brute force —
i.e. cannot be solved by Undead's lone deductive technique. Every other hard puzzle
in the collection has a graduated deductive ladder (the Latin family:
positional → set → forcing chains (`Extreme`, still deduction) → recursion
(`Unreasonable`)). Undead simply never built the middle rungs.

## What Changes

Add the missing deductive rungs to Undead's solver so its Easy/Normal/Tricky tiers
become guess-free, and move the genuinely-recursion-only residual (if any survives)
to an explicitly-sanctioned `Unreasonable` tier — or drop it, decided by measurement.

- **Solver: two new deductive rungs** (`undead/solver.ts`), both human-doable and
  narratable:
  1. **Exact global counting.** Promote the monster totals from per-path upper bounds
     (`checkNumbers`'s `≤`) to first-class equality constraints with Hall-type
     reasoning: a monster type whose full count is placed is struck everywhere; a
     type whose remaining count equals its candidate cells forces them all; too few
     candidate cells for a type's required count is a contradiction (feeds forcing).
  2. **Single-level forcing.** For one undecided cell, tentatively fix each candidate,
     run the arc-consistency + counting fixpoint, and eliminate any candidate that
     forces an immediate contradiction. This is depth-1 only (the `DIFF_EXTREME`
     forcing technique, deduction not guessing); *nested* forcing stays out (that is
     recursion = `Unreasonable`).
- **Re-grade difficulty by which rung is needed** (`undead/generator.ts`), not by
  brute-force amount: Easy = arc-consistency; Normal = needs counting; Tricky = needs
  forcing. **Accept a non-`Unreasonable` board only when the deductive ladder solves
  it uniquely with zero recursion** (the guess-free gate).
- **The recursion-only residual — a measured gate.** After the rungs land, re-grade
  the current generator population and measure how many boards still need recursion.
  - If that residual is negligible → **drop it** (reject those boards at generation;
    Undead becomes fully guess-free, no `Unreasonable` tier).
  - If it is a meaningful population (the data suggests the high-ambiguity Tricky
    boards may be) → **keep it as a new, explicitly-named `Undead Unreasonable`
    preset** (the sanctioned exception), so the hardest content isn't discarded.
  The threshold and the resulting preset list are settled with the owner from the
  re-grade numbers during implementation.
- **Differential check** (`undead-differential.test.ts`): its role narrows. Undead's
  ladder now *deliberately diverges* from upstream (which has no forcing layer), so
  the differential keeps the **soundness** cross-check — a board we accept is still
  uniquely solvable, and our deductive ladder never "solves" a board the brute-force
  oracle finds non-unique — rather than matching upstream's grading verdicts.

## Impact

- **Affected specs:** `undead` — MODIFIES the "solves and generates uniquely-solvable
  graded boards" requirement to mandate the deductive ladder + the guess-free
  generation gate + the sanctioned-`Unreasonable` exception. The project-wide
  normative home for the guess-free policy is a future generation-policy requirement
  (this change states it for Undead; `hint-authoring.md` §1A is the followable
  summary today).
- **Affected code:** `src/native/games/undead/{solver,generator}.ts` and their tests;
  possibly `state.ts` (a new `Difficulty` member if an `Unreasonable` tier is added).
- **Affected change:** `add-undead-hint` **depends on this** — once Undead is
  guess-free, the hint drops its solution-walk fallback (that proposal's D3) entirely
  and narrates the counting/forcing deductions (forcing narrates *better* than
  arc-consistency: "if this were a vampire, the left clue of 2 couldn't be met — so
  it can't be"). The `add-undead-hint` proposal is revised accordingly.
- Parity-gated: owner acceptance after the re-grade decision (drop vs `Unreasonable`)
  and a play-test of the strengthened tiers.

## Out of scope

- **Joint multi-path / path-consistency reasoning** (a candidate individually
  supportable on two paths but not simultaneously) — a potential *further* rung, held
  in reserve. Build it only if measurement shows counting + forcing leave too many
  boards needing recursion. Noted here as a follow-up, not implemented.
- **Other games' tiers.** Towers and Keen already satisfy the policy (their guessing
  boards live under a correctly-named `Unreasonable` preset). No change to them.
- **Implementation.** This change is the design + plan; the solver/generator work,
  the re-grade measurement, and the keep-vs-drop decision happen in the follow-up
  implementation session.
