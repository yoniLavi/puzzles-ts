# Tasks — audit-vestigial-contract-surface

> The artefact is `audit.md` — a table with a verdict and its evidence per row.
> Model it on `openspec/changes/archive/2026-08-01-audit-author-known-issues/audit.md`.
> **Check the instrument before every count** ([[feedback-check-the-instrument]]
> is not decoration here: this audit's whole subject is claims that were true of
> a neighbour of the thing they described).

## 1. Sweep: parameters with one live argument

- [ ] 1.1 Enumerate every boolean/enum parameter on `Game` and on `EngineCore`,
      and for each, list its **actual** call sites and the values passed. Derive
      the call sites mechanically — a grep for the parameter *name* finds
      definitions and comments, not calls.
- [ ] 1.2 `encodeParams(p, full)` explicitly: same name and provenance as the
      defect, believed live (`full=false` drops generation-only params from a
      shared id). Prove it, do not assume it.
- [ ] 1.3 Record each as live / dead-remove / dead-wire-up.

## 2. Sweep: optional `Game` hooks

- [ ] 2.1 For every optional member of the `Game` interface, count implementers
      and callers. **Both** counts matter and they fail differently: no
      implementer means dead weight in the interface; no caller means every
      implementer wrote code that never runs.
- [ ] 2.2 Guard against the obvious instrument error — a hook invoked through
      an optional-call (`this.game.hook?.(…)`) or a destructured alias will not
      be found by grepping the member name at a call position. Enumerate from
      `game.ts` and search each name across `src/`, then read the hits.

## 3. Sweep: unreachable return cases

- [ ] 3.1 For engine functions returning a union or `| null`, check that some
      caller branches on each arm. A `null` nobody tests for is a case that
      cannot be signalled.

## 4. Sweep: comments that make a checkable control-flow claim

- [ ] 4.1 Start from the exemplar phrasing (`because \`full\` is false there`)
      and generalise: comments of the form "X happens because Y" where Y is a
      value or a branch. This is a *reading* task, not a regex; scope it to
      `src/engine/` plus every game's `validateParams`/`executeMove`, which is
      where the contract claims cluster.
- [ ] 4.2 For each, confirm the claim against the code. Where it is false, the
      fix is usually to make it true (as `bound-abcd-generable-sizes` did),
      not to delete the sentence — three authors agreeing on the intent is
      evidence about what the code *should* do.

## 5. Act

- [ ] 5.1 Apply the removals and the wire-ups. Anything that changes behaviour
      a player can see gets flagged to the owner before it lands, per AGENTS.md
      § "Nothing is sacred".
- [ ] 5.2 Anything argued unreachable-but-kept is recorded with its argument,
      in the `feedback-probe` `equivalent: true` style.

## 6. Prevent recurrence

- [ ] 6.1 Decide whether any of the four shapes is cheaply and *non-vacuously*
      checkable as a test. The candidate with the best ratio is "every optional
      `Game` member has ≥1 implementer and ≥1 caller", derivable from the
      registry the way `save-round-trip.test.ts` and `touch-input.test.ts`
      already sweep it.
- [ ] 6.2 If a guard lands, **prove it fails** — add a dead optional hook,
      watch it go red, revert.
- [ ] 6.3 Carry a vacuity guard ("how many members did I inspect?"), the
      repo's recurring lesson about sweeps that silently inspect nothing.

## 7. Close out

- [ ] 7.1 `ts-engine` spec delta.
- [ ] 7.2 `docs/games/mechanics.md` — if a hook is removed or its contract
      clarified, the guide that tells a new port which hooks to implement is
      the page that must not go stale.
- [ ] 7.3 Owner acceptance, then archive.
