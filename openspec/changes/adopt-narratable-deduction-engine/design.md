# Design — one narratable deduction engine per logic game

## The thesis

A logic game's generator and its explained hint are two projections of **one
deduction engine**:

- **Generation projection** (recorder off): run the technique rungs to a
  fixpoint from the empty board; accept iff fully solved (deductive completion ⇒
  unique, so no separate uniqueness pass); the highest rung used **is** the
  difficulty grade.
- **Hint projection** (recorder on): the same rungs fire from the player's
  current marks, each tagged with its technique + premise, grouped one-firing =
  one step, narrated.

This is already how the threaded games work (`latin.ts`, Range, Singles,
Filling, Unruly). The change makes it the *explicit, uniform* shape and states
the policy that keeps the two projections honest.

## D1 — The shared scaffold (Phase 1)

`engine/deduction-fixpoint.ts` exposes `runDeductionFixpoint({ rungs, maxRung,
recorder })`:

- `rungs`: an ordered list of technique callbacks; each returns whether it
  changed the board (and, on the recording path, records its firing). Easiest
  first; a pass tries rungs in order and restarts on the first that fires
  (the "return after first firing" discipline that keeps one firing = one group).
- `maxRung`: cap the ladder while *grading* (don't pay for the expensive top
  rung on a board a cheaper tier will reject anyway — the Undead
  `strengthen-undead-deduction` lesson).
- `recorder`: optional; gates every reason allocation so the generation path is
  byte-for-byte unchanged (the existing per-game discipline, now in one place).
- A `stepBudget` tick per iteration on the recording path only (hint-authoring
  §7.2), so a non-terminating fixpoint throws a labelled error instead of
  hanging — and the generator runs unguarded.

The **techniques stay per-game** (nonogram overlap ≠ sudoku hidden single — no
refactor collapses that); only the loop, the cap, the recorder threading, and
the budget move into the scaffold. This is the non-Latin analogue of the
already-extracted `candidate-hint.ts` / `latin-hint.ts` slices, so the four
current hand-rolled loops (Filling, Pattern, Undead, `latin.ts`) are the
extraction's ≥3 real call sites.

Phase 1 is a **pure refactor**: same techniques, same order, same verdicts. The
differentials and behavioural suites are the regression gate.

## D2 — The policy: no un-narrated fallback (Phase 2)

Normative rule (added to `ts-migration` as generation policy, with the
Hint-System companion in `ts-engine`):

> Every non-`Unreasonable` board a logic game generates SHALL be solvable by the
> same narratable techniques its hint teaches, and a displayed hint step SHALL
> always name a technique — never a generic unexplained "fallback."

**Two compliant strategies, chosen per game by cost:**

1. **Narrate everything the gate accepts.** Promote any catch-all into an honest
   technique, even a non-local or tedious one (Filling narrates its global
   candidate-elimination honestly rather than hiding it — §5.6). Keeps the full
   generated-board set (and any byte-match differential) intact.
2. **Reject at generation.** Accept a board only if the narratable techniques
   solve it to completion; the rare board that needs an un-narratable deduction
   is retried away. Shrinks the generated set.

Both satisfy "every hint step explains why." The owner's stated preference is
(2) — keep the taught technique set crisp and reject the odd board — but (1) is
equally compliant and is the right call when rejection is too costly (see D3).

## D3 — Why the flip stages per game (not a literal simultaneous big-bang)

Two things can only be settled by per-game measurement, so Phase 3 is one change
per game, not a single sweep:

- **Rejection rate.** Strategy (2) rejects boards; for Pattern that is a measured
  0.03%, but a game whose teachable set is materially weaker than its full solver
  could reject a large fraction — slow "New Game," or thin/empty a size or tier.
  Measure before flipping; if it's costly, pick strategy (1) instead.
- **Difficulty-tier drift.** Redefining "solvable" as "narratably-solvable" can
  shift a preset's character (a tier defined by a now-rejected deduction changes
  or empties). Re-grade after flipping.

The **mechanical** Phase 1 extraction is safe to sweep in one change; the
**policy** flip is staged behind these measurements. Most ported games are
expected to already comply (the threaded recorder narrates every firing), so the
audit should confirm rather than rework — but that expectation is *verified* per
game, not assumed.

## D4 — Pattern's specific case (the first Phase-3 target, decided in its change)

**Line-enumeration is deduction, not backtracking.** Pattern's `doRow` enumerates
the ways *one line's* runs can sit and keeps the cells forced in *every*
arrangement — single-constraint analysis, the same family as a Latin hidden
single. It never fixes a cell and solves the rest of the board under that
assumption; the cross-line "suppose arrangement A, propagate, contradiction, try
B" *is* backtracking, and Pattern's generator already **rejects** every board that
needs it (its solvability gate is the per-line deduction fixpoint). So Pattern
ships zero non-deductive boards, and the enumeration rung stays a normal deductive
rung — **not** an `Unreasonable` concern.

**The "fallback" residual is a completeness question, not a reject-vs-promote
binary.** The current fallback fires because Pattern ships only the two *simplest*
named techniques (overlap, unreachable). Board-level, that residual is
size-dependent — measured ~0.3% (10×10) rising to ~28% (30×30). Those boards are
**fully deductively solvable** (via the enumeration rung); they just aren't
covered by the two elegant techniques. So the recommended Phase-3 shape is:

1. **Enrich the named technique set** (edge/anchor forcing, run-completion,
   gluing) so elegant steps cover the common cases and the residual shrinks.
2. **Keep line-enumeration as an honest deductive *bottom rung*** of the one
   engine, narrated *"only these cells are black in every way this line's runs can
   fit"* — rare once (1) lands, always deductive, always explained. `doRow` becomes
   that bottom rung, not a separate solver, keeping it consistent with the
   one-engine thesis.

This keeps every generated board (deductive completion ⇒ unique), **keeps the
byte-match differential** (generation is untouched), and never shows a "just
because" step. **Rejection** — accept only boards the *elegant* techniques solve,
which would forfeit the byte-match and retire `doRow` — is documented as the
*stricter* alternative (a teaching-elegance bar, not a deductive one), advised
against here because at 30×30 it discards ~28% of boards and biases the survivors
toward regularity. The final choice is made in Pattern's own Phase-3 change against
the measured cost.

## D5 — What this does *not* do

- It does **not** make the hint engine the generator's oracle in a way that
  slows the hot loop or couples grading to legibility: the recorder is *gated
  off* for generation, leaving only technique application (often as fast as, or
  faster than, a brute solver — human techniques are efficient).
- It does **not** touch movement/objective games (Fifteen, Sixteen, Flood,
  Untangle): they have no deductive "why," their hints are heuristic/aux-walk
  (§6), and there is no solver to unify. The policy governs *logic* games only.
- It does **not** remove the `Unreasonable` carve-out: an `Unreasonable` tier MAY
  require guess-and-backtrack, keeps a minimized backtracking oracle, and its
  hint MAY be non-deductive on those boards.

## Out of scope

- The per-game Phase-3 flips themselves (each its own change: Pattern first, then
  an audit-and-confirm pass over the threaded games).
- Any change to movement-game hints.
