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

- [x] 1.1 `repo-layout` spec delta: deltas are `ADDED` only; an edit to an
      existing requirement is made in `openspec/specs/` in the same commit.
      Widened while implementing — the requirement text said "only `ADDED`" but
      its refusal scenario named only `MODIFIED`, so the scenario now covers
      every editing verb, and a paragraph states why removal and renaming are
      banned too (see 3.1).
- [x] 1.2 `AGENTS.md` — replaced the "a MODIFIED delta silently deletes whatever
      it omits" workaround paragraph with the rule, keeping the incident (the
      134 lines) as the reason.
- [x] 1.3 `openspec/OPENSPEC_AGENTS.md` — a **"Project override: deltas only
      ADD"** block at the top, countermanding the upstream text below it, which
      still prescribes `MODIFIED` in its own voice. There is no managed-block
      marker inside that file: `openspec update` regenerates the whole of it, so
      the override has a deletion scheduled. It is therefore **guarded** (3.1)
      and the re-apply step is recorded next to the existing rename dance in
      `AGENTS.md`'s managed block.

## 2. Convert the three open changes

> **Re-derive each from the live spec. Do not edit the stale copy** — the copy
> being stale is the entire defect, and "fixing it up" reproduces it by hand.

- [x] 2.1 `add-latin-repeats-support` (`salad`) → ADDED "Salad reasons about the
      empty square directly". One in-place edit named in `proposal.md`: the
      sentence realising empty squares "by treating symbols above `nums` … so the
      shared cube is reused unchanged" is the translation layer being retired.
      Two of the stale copy's four scenarios were verbatim duplicates of live
      ones and are simply left where they are.
- [x] 2.2 `add-slide-keyboard-control` (`slide`) → ADDED "Slide is playable by
      keyboard". **This is where re-deriving paid for the whole change.** The
      stale delta modified "Slide input, movement and completion" and carried
      prose announcing the removal of *"SHALL be played by mouse or touch drag
      only — it has no keyboard cursor"* — a sentence that lives in a **different
      requirement** ("Slide game implements the Game interface", line 28), which
      the change had no delta for. Archiving it would have published a spec that
      declared a keyboard player's exclusion removed while leaving it in force
      one requirement above. The one genuine edit is now named in `proposal.md`;
      everything else the delta wanted is additive, which is why it reads as an
      addition.
- [x] 2.3 `audit-input-mode-parity` (`ts-engine`) → ADDED "Touch equivalence is
      guarded at gesture level, not only at press level", joining the existing
      keyboard-reachability requirement. The live press-level requirement is
      **not** rewritten: its whole-board press sweep stays true and stays worth
      having. One in-place edit named in `proposal.md` — *"Pattern is the only
      such game"* is false since Loopy landed.
- [x] 2.4 Checked mechanically: every scenario name in each old delta is still
      reachable, either in the new ADDED requirement or already in the live spec.
      Nothing dropped. (One deliberate rewording: "A game that asks for the bit
      is still covered by a guard" → "A game that asks for the stylus bit is
      still covered".)

> **What replaced the check that could not be written.** The task said "diff the
> converted form against the live requirement and confirm nothing is dropped" —
> but under Option A there is no copy to diff, which is the point. The question
> becomes *is every statement the stale copy carried still accounted for?*, and
> each falls into one of three places: still in the live requirement untouched,
> moved into the new added requirement, or named as an in-place edit in the
> proposal. Scenario names make the third of that mechanically checkable; the
> prose was read.

## 3. Repoint the guard

- [x] 3.1 `openspec-delta-integrity.test.ts` asserts no active delta uses
      `MODIFIED`, **`REMOVED` or `RENAMED`**. Decided explicitly rather than by
      omission, and the archive's own shapes are what decided it: only `MODIFIED`
      carries a copy of the requirement, so only it can delete content silently —
      `REMOVED` names a requirement plus a reason, `RENAMED` is a `FROM:`/`TO:`
      pair. They are banned anyway because "`ADDED` is the only verb" is a rule
      with nothing to remember and a check that cannot be subtly wrong, where a
      per-verb carve-out re-opens "is this one safe?" at every use. The
      `**Reason**`/`**Migration**` prose a `REMOVED` block carried was already
      hand-written; it goes in `proposal.md`.
      The scenario-survival machinery is **deleted**, not kept alongside: with
      `MODIFIED` refused it could never fire again, and a guard that cannot fire
      tells the next reader the mechanism is still in use.
      A fourth assertion guards the 1.3 override block against `openspec update`.
- [x] 3.2 **Proved it fails**, twice over. The delta sweep's first run was
      against the three *real* unconverted deltas — stronger evidence than a
      fixture, since it named a genuine offender and stopped. Then a scratch
      delta carrying `REMOVED` **and** `RENAMED` alongside an `ADDED` section:
      both reported with line numbers, the `ADDED` section correctly ignored;
      deleted, green again.
- [x] 3.3 Scoped to `openspec/changes/` and not `archive/` — the single `*` in
      the glob is what excludes it, and a standing assertion checks no matched
      path contains `/changes/archive/`.

## 4. Verify

- [x] 4.1 Archived `add-slide-keyboard-control` end-to-end (the unimplemented one,
      so there is no temptation to keep the result): openspec reported
      `+ 1 added, ~ 0, - 0` and `git diff` showed **62 insertions and zero
      deleted lines** in `openspec/specs/slide/spec.md`. Reverted with
      `git reset --hard` + `git clean -fd openspec/changes/`. Run **after**
      committing rather than on a branch — this project does not branch
      (`feedback_trunk_based_no_branches`), and a committed tree makes the
      experiment reversible without one.
- [x] 4.2 Full gate green — 268 files, 7310 passed, 6 skipped; probe anchors all
      apply (174 cases, 18 modules); `vite build` clean. Also proved the 1.3
      override guard fires: removing the marker from `OPENSPEC_AGENTS.md` fails
      the commit with the re-apply instruction, and restoring it goes green.

## 5. Close out

- [ ] 5.1 **Blocked — do not archive.** See the banner at the top of
      `proposal.md`: openspec 1.6.0+ already refuses the loss this change routes
      around, and the repo is on 0.15.0. Sequenced behind
      `upgrade-openspec-tooling`; the likely outcome is that most of this change
      is reverted, keeping the §2.2 Slide fix.
