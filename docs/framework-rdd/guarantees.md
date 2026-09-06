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

**~~Declaring~~ *Having* a capability enrolls its guards.** This generalizes
what `difficulty-contract.test.ts` and `touch-input.test.ts` already do. The
suite iterates the registry — asserting first that the registry's own count
matches the catalog, in both directions, so an empty registry can never
vacuously pass (the lesson is now a design input: **every sweep opens by
asserting the size of the population it sweeps**).

> **✅ SETTLED, and the word is "having"** —
> `audit-declared-versus-derived-capabilities`, 2026-09-06. The live rule is
> [`docs/games/testing.md`](../games/testing.md) § "How a cross-game guard finds
> its population" and the `ts-engine` spec, "A shared mechanic is joined by
> having it"; read those, not this.
>
> The sentence above used to name `testing/hint-games.ts` as a hand-list that
> declaration would retire. **It had already been retired, by
> `derive-hint-enrollment`, and not by a declaration**: it filters the registry
> on `typeof game.hint === "function"`. The survey then read the whole
> population rather than that one example, and found the repo had converged
> without saying so: of the **29 optional members** of the `Game` contract,
> **26 declare themselves by existing** — a `hint()` is the hint declaration —
> and only three are boolean flags. There is no manifest anywhere, and the one
> attempt to build one over this ground, `declare-the-gesture-table`, was
> withdrawn.
>
> **What the survey found that this document did not distinguish**, and which is
> the reason it read as wrong rather than merely imprecise: *declaration-as-input*
> and *declaration-as-manifest* are different things. A technique's `tier`, a
> `paramConfig` item, a `presets()` menu are **inputs a mechanism consumes** —
> those are healthy, they shipped, and the deduction end runs on them, so the
> "you declare" frame is right there. A statement *about* a game that only a
> guard reads is a **manifest**, and every one this repo has tried has been
> reversed: eighteen `needsRightButton` declarations deleted by
> `audit-input-mode-parity`, the gesture table withdrawn, the hint list derived.
>
> **Intent that behavior cannot show does exist — and it never carries
> enrollment.** Every case in the tree is a *reason attached to a derived
> member*: `NO_KEYBOARD`, `NO_FLAG`, `EVIDENCE_WASH_GAMES`, `NO_CONSUMER`,
> `NARRATES_MOVES`, `nonUniqueTiers`, `nonMonotone`. The derivation says who;
> the ledger says why, and the derivation checks the ledger. Three of those are
> **empty and meant to stay so**, including `NO_KEYBOARD` — the very example
> this note used to cite as proof that declaration was needed.
>
> **The capability-manifest diff [`migration.md`](./migration.md) asks for needs
> no manifest.** A derived set snapshotted in the guard is the same diff and
> cannot be forgotten by a new game; it already ships five times over
> (`NO_KEYBOARD` equality, `mark-all`'s enrolled ≡ offering, the note-taking
> eleven, the border-grid two, `ignoresSecondaryButton` iff).

## What every game gets asserted, per capability

> **The column used to be headed "Declaration", and every row was classified
> against that word** by `audit-declared-versus-derived-capabilities`. The
> result: **not one of the eight needs a manifest.** Six are *had* — the board
> model, the planner, invariants/mistakes, presentation and the two affordances
> are all read off an object, a method or a `Ui` field the game already carries.
> Two are **declaration-as-input**, a mechanism's parameters rather than a
> statement about the game, and both have shipped in that form: the technique
> ladder's `{ id, tier, run }` (`declare-deduction-techniques`) and params
> (`paramConfig` + `paramsCodec`). One — the gesture table — is withdrawn.
>
> Which tier a technique belongs to is the survey's one genuine "intent behavior
> cannot show", and note where it lives: on the *technique*, consumed by
> `runDeductionFixpoint` at run time, not on the game for a guard to read.

| Capability | Generated guarantees |
| --- | --- |
| ~~Board model~~ | ~~State clone independence; desc codec round-trip (property-fuzzed); coordinate maps agree from both callers; cursor stays in bounds on every topology.~~ **Withdrawn 2026-09-06** with the declaration. The one row worth wanting — *coordinate maps agree from both callers* — turned out not to need it: making the board's pixel origin one exported function makes the agreement true by construction, which is stronger than a test asserting it (`unify-the-board-origin`). |
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
