# Tasks — retire-modified-spec-deltas

## 0. Decision — settled, recorded here so it is not re-litigated

- [x] 0.1 **Option A: retire `MODIFIED`.** Decided 2026-08-21 by the agent, on
      the owner's note that the workflow has exactly one user and should be
      whatever lets that user work effectively. Reasoning and the two rejected
      options are in `proposal.md`; the short form is that A is the only option
      with nothing to remember at a moment separated from the moment the copy
      was taken.
- [x] 0.2 Consequences accepted: a withdrawn change reverts its spec edit by
      hand (rare; one instance ever), and "what the rule used to say" is
      answered by `git log openspec/specs/<cap>/spec.md` rather than by the
      archive folder. The spec edit lands **at archive time**, so
      `openspec/specs/` still describes only accepted behaviour.

## 1. Establish the rule

- [ ] 1.1 `repo-layout` spec delta: deltas are `ADDED` only; an edit to an
      existing requirement is made in `openspec/specs/` in the same commit.
- [ ] 1.2 `AGENTS.md` — replace the "a MODIFIED delta silently deletes whatever
      it omits" workaround paragraph with the rule. Keep the *incident* (the
      134 lines) as the reason; a rule whose motivating failure is not recorded
      gets re-litigated.
- [ ] 1.3 `openspec/OPENSPEC_AGENTS.md` — point at the project rule, inside the
      managed block's constraints (`openspec update` regenerates that file; see
      the proposal's Impact note).

## 2. Convert the three open changes

> **Re-derive each from the live spec. Do not edit the stale copy** — the copy
> being stale is the entire defect, and "fixing it up" reproduces it by hand.

- [ ] 2.1 `add-latin-repeats-support` (`salad`).
- [ ] 2.2 `add-slide-keyboard-control` (`slide`) — note its requirement is one
      this change *inverts* ("SHALL be played by mouse or touch drag only"), so
      it is a genuine edit, not an addition: the clearest test of whether Option
      A expresses what changes actually need.
- [ ] 2.3 `audit-input-mode-parity` (`ts-engine`).
- [ ] 2.4 For each: diff the converted form against the live requirement and
      confirm nothing is dropped — the manual version of the check the
      integrity test was doing.

## 3. Repoint the guard

- [ ] 3.1 `openspec-delta-integrity.test.ts` asserts no active delta uses
      `## MODIFIED Requirements` (or `RENAMED`/`REMOVED` if 0.1 extends to them
      — decide explicitly rather than by omission).
- [ ] 3.2 **Prove it fails**: add a `MODIFIED` heading to a scratch delta, watch
      it go red, revert.
- [ ] 3.3 Keep it scoped to `openspec/changes/` and *not* `archive/` — archived
      changes legitimately contain `MODIFIED` and always will.

## 4. Verify

- [ ] 4.1 Archive one converted change end-to-end on a scratch branch and
      confirm `git diff openspec/specs/` shows additions only.
- [ ] 4.2 Full gate green.

## 5. Close out

- [ ] 5.1 Owner acceptance, then archive — using the new rule, which makes this
      change its own first test.
