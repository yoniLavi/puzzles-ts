# upgrade-openspec-tooling

## Why

**The tool that gates this project's entire work-management workflow is nine
months stale, and nothing in the repository names it.**

`openspec` here is `@fission-ai/openspec@0.15.0`, installed with `npm i -g` on
**2025-11-20** into Homebrew's node prefix and never updated. Current is
**1.10.0** — a major version and fifteen minors on. It appears in no
`package.json`, no `.husky/pre-commit`, no `scripts/gate.sh`: its version is a
property of one laptop, invisible to the repo, unpinned and unasserted.

**The cost is already paid, and it is not small.** `retire-modified-spec-deltas`
spent a change retiring the `MODIFIED` delta verb, writing a bespoke commit-gate
guard, a project-override block in `openspec/OPENSPEC_AGENTS.md` and a second
guard asserting that block survives `openspec update`. Every layer of that exists
to route around a defect **upstream fixed in 1.6.0**:

| version | changelog entry, verbatim |
|---|---|
| 1.6.0 | "Safer requirement archiving — Stop stale `MODIFIED` requirements from silently deleting scenarios that were added by an earlier archive" |
| 1.7.0 | multiplicity-aware drift check; ignores `#### Scenario:` inside fenced code blocks |
| 1.8.0 | "`openspec validate <change>` now reports a MODIFIED requirement that omits a scenario the main spec still has — the same loss archive already refuses to apply" |
| 1.10.0 | recognises every level-4 `####` child of a requirement as a scenario |

The 1.6.0 entry *is* the `disambiguate-hint-deixis` incident (134 lines of the
`ts-engine` hint requirement deleted at archive, 2026-08-15), described in
upstream's own words.

**Verified against the running tools, not the changelog.** 1.10.0 was installed
into the session scratchpad, the pre-change deltas checked out in a throwaway
worktree, and one live scenario deleted from the salad `MODIFIED` block:

```
0.15.0 →  Change 'add-latin-repeats-support' is valid
1.10.0 →  ✗ [ERROR] salad/spec.md: MODIFIED "Salad ports the solver as a shared
          Latin-square consumer" omits scenario(s) the current spec still has:
          "Generation is reproducible from a seed". Copy them into the MODIFIED
          block (a MODIFIED requirement replaces the whole block, so archive
          refuses to drop them).
```

That is the hand-written guard, at authoring time, with a better message — plus
three hardening cases the hand-written one lacks (repeated scenario names, fenced
code blocks, unlabeled `####` children). Four upstream releases of iteration on a
check this repo reimplemented once.

**The generalisable finding: `feedback_check_the_instrument` applies to
dependencies.** The repo has caught ten measurements that were wrong about their
unit. This is the same error aimed at a tool — checking what the *installed*
version does and generalising it to what "the tool" does. **A pinned version is
what makes that check possible; an unpinned global install makes "is this
still true?" unanswerable from inside the repo.**

## What Changes

- **Upgrade to `@fission-ai/openspec@1.10.0`**, and **pin it** — a devDependency,
  so `npm install` is still the entire setup and the version is a fact the repo
  states rather than a property of a laptop.
- **Assert the floor.** A minimum-version check, so a machine running an older
  CLI is told, rather than silently archiving with the unsafe merge. This is the
  control the whole episode lacked.
- **Re-evaluate `retire-modified-spec-deltas`,** which is committed, implemented
  and **blocked from archiving** pending this. Expected outcome: revert most of
  it — `MODIFIED` becomes legal again, the override block and its guard go — and
  keep the two findings that survive regardless (below). That is a decision for
  the owner, recorded in `design.md`, not one this change makes silently.
- **Retire the rename dance, if 1.x really does end it.** The migration guide says
  `openspec/AGENTS.md` is deleted as obsolete and OpenSpec markers are stripped
  from `AGENTS.md`/`CLAUDE.md` with our content preserved. That would close the
  "Known unresolved questions" entry that has wanted a configurable instruction
  filename since the fork began — upstream's answer is not to configure the name
  but to stop generating the file. **The CHANGELOG does not corroborate this**, so
  it is verified by running the upgrade, not assumed.

**Two findings survive whatever is decided about the delta verbs**, and neither
is a mechanism artifact:

1. **`add-slide-keyboard-control`'s delta targeted the wrong requirement.** It
   modified "Slide input, movement and completion" while its prose announced
   removing *"SHALL be played by mouse or touch drag only — it has no keyboard
   cursor"* — a sentence living in "Slide game implements the Game interface",
   which the change had no delta for. Archiving it would have published a spec
   declaring a keyboard player's exclusion removed while leaving it in force. No
   scenario-survival check, ours or upstream's, can see this: both requirements
   are scenario-complete. **A copy can be faithful to the wrong original.**
2. **The CLI is unpinned**, which is what this change fixes.

## Impact

- **Affected specs**: `repo-layout` — the toolchain requirement (ADDED).
- **Affected code/docs**: `package.json`, `scripts/gate.sh` or an equivalent
  version assertion, `AGENTS.md`'s managed block and "Known unresolved
  questions", `openspec/OPENSPEC_AGENTS.md` (likely deleted by the upgrade), and
  `src/openspec-delta-integrity.test.ts` (likely reverted).
- **Risk, and why this is its own change rather than a bolt-on.** 1.x replaces
  the phase-locked proposal → apply → archive sequence with an action-based
  workflow; the three `openspec:*` skills, `OPENSPEC_AGENTS.md` and this repo's
  documented process all assume 0.x. **288 archived changes, 9 active ones and 79
  specs must still validate afterwards** — `openspec validate --all --strict` is
  the acceptance gate, and it is cheap. The migration guide states active
  changes, the archive and `openspec/specs/` are all preserved; that claim gets
  checked, not trusted.
- **Not in this change**: any rewrite of archived deltas. They are history, and
  1.x reads them fine.
