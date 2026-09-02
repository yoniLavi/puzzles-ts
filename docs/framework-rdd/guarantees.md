# Guarantees — the conformance suite

> **⚠️ STATUS: design fiction** — describes a system that does not exist.
> Authored by `rewrite-game-dev-docs` (2026-08-07). Current truth:
> [`docs/games/`](../games/README.md). See the [vision README](./README.md).

The framework's second half. Declarations buy behavior; this document lists
what the *machine* asserts about every game the moment its definition exists —
enrollment-free, because a hand-maintained enrollment list is a defect class
(the collection has already been bitten by guards that measured a neighbor
of the thing they claimed to guard; a list of "games that opted in" is that
shape institutionalized).

## The standing principle

**Declaring a capability enrolls its guards.** This generalizes what
`difficulty-contract.test.ts` and `touch-input.test.ts` already do, and
retires the hand-lists (`testing/hint-games.ts`). The suite iterates the
registry — asserting first that the registry's own count matches the catalog,
in both directions, so an empty registry can never vacuously pass (the
lesson is now a design input: **every sweep opens by asserting the size of
the population it sweeps**).

## What every game gets asserted, per declaration

| Declaration | Generated guarantees |
| --- | --- |
| Board model | State clone independence; desc codec round-trip (property-fuzzed); coordinate maps agree from both callers; cursor stays in bounds on every topology. |
| Gesture table | Every move constructor reachable by pointer, keyboard AND touch (or a declared, reported gap); the four frontend traps exercised; no raw-button comparison can go deaf to touch. |
| Technique ladder | Fixpoint terminates within budget on every preset; grade cap-monotone; tiers bind (a board graded T is rejected by cap T−1); **N generated boards per preset walk to completion through the hint projection — the full-hints invariant**; every firing's narration non-empty and its highlights on-board. |
| Planner | Plan exists from any reachable mid-position (resume guard); recompute-stability (one step forward → same subgoal); step budgets tick. |
| Invariants / mistakes | Clean board → empty; a seeded wrong board → non-empty; overlay clears on next transition; refusal couples to the banner. |
| Presentation | Paint-twice for every overlay plane (warm cache → overlay appears; third frame → erases); doctrine invariants (no engine pixels, `canvasCleared` the only stale signal); snapshot baselines per preset opener frame. |
| Params | Encode/decode inverse; `validateParams` agrees with the dialog path; presets encode fully. |
| Affordances | Pencil: mark-all resets notes (mutation-checked — the guard must *narrow* a cell or the bug hides); reference: spotlight dismisses per the suppression rule; prefs survive `newUi`. |

Per-game tests do not disappear — they shrink to what is actually per-game:
the technique logic's own unit tests, the narration wording assertions, and
any bespoke-hatch obligations. The generated layer is the floor, not the
ceiling; `docs/test-strength.md`'s discrimination discipline applies to the
per-game layer unchanged.

## Instruments follow structure

Two standing repo lessons are design inputs here, so the suite cannot rot the
way earlier instruments did:

- **The probe walks the registry too.** `npm run probe`'s discovery is
  derived, with a committed floor on what it finds, inside `--verify` — a
  structural change that shrinks discovery fails the gate rather than
  quietly reporting success (this shipped in `group-crowded-source-
  directories`; the framework keeps it and extends the floor to the
  conformance sweep itself).
- **No silent caps.** Wherever the suite samples (N boards per preset), the N
  is declared in one place, reported in the output, and bounded below by an
  assertion — a sweep that covered nothing must say so.

## Cost control

Generated guarantees multiply: 57 games × the table above is a big matrix.
The suite tiers itself like today's gate: the per-commit slice runs the
changed game's full column plus the cross-game invariants that are cheap in
aggregate; the full matrix is CI/manual (`npm run gate` semantics today). A
generated test is still subject to the right-sizing rules in
[`docs/games/testing.md`](../games/testing.md) — determinism by fixed seed,
never clock-gated, heavy scans pinned to named seeds.
