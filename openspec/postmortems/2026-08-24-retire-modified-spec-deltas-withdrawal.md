# Postmortem: retiring the MODIFIED spec delta, withdrawn

**Date:** 2026-08-24
**Status:** Withdrawn. The rule is reverted; the tool was upgraded instead.
**Implementation preserved at:** commits `db23e69` and `7431d7c` on `main`.
**Superseded by:** `upgrade-openspec-tooling`.

## TL;DR

Archiving `disambiguate-hint-deixis` (2026-08-15) silently deleted **134 lines**
of the `ts-engine` hint requirement, because `openspec archive` replaces a live
requirement with a `MODIFIED` delta's stale copy of it. The repository responded
by retiring the `MODIFIED` verb altogether, hand-writing a scenario-survival
check into the commit gate, adding a project-override block to the generated
openspec instructions file, and adding a second guard asserting that the override
block survived `openspec update`.

Every layer of that was unnecessary. The installed CLI was `@fission-ai/openspec@0.15.0`
— `npm i -g` on 2025-11-20, never updated — and upstream had fixed the defect in
**1.6.0** (archive refuses the loss) and moved the report to authoring time in
**1.8.0**. The current release was **1.10.0**. The owner's question, on being
shown the change, was the one nobody had asked: *"if we need to fight against the
openspec tool, maybe we need to change the tool."*

## What went wrong in the reasoning

**The instrument was never checked.** This repository has caught ten
measurements that were wrong about their unit, and has a standing rule about it.
The rule was applied to tests, harnesses and fixtures — and not to a dependency.
Checking what the *installed* version does and generalising it to what "the tool"
does is the same error aimed at a package.

**The proposal argued itself into the answer and then walked past it.** It
rejected keeping `MODIFIED` behind a stronger check on the grounds that
*"guidance is what you write when the tool cannot be trusted; the goal here is a
tool that can [be trusted]"*. That sentence is correct, and the way to get such a
tool was `npm update`, not a new rule. Upstream's answer to the same problem was
precisely the rejected option — the delta format is unchanged in 1.x — and it
works.

**The hand-written check was weaker than the one it replaced.** Upstream's had
four releases of hardening this one lacked: a requirement keeping only one of two
same-named scenarios (1.7.0), `#### Scenario:` lines inside fenced code blocks
(1.7.0), and level-4 children that are scenarios without carrying the label
(1.10.0). Reimplementing a dependency's check discards its bug history.

**Workaround layers were treated as design instead of as a symptom.** The change
ended with a rule contradicting the tool's own documentation, an override block
inside a file the tool regenerates, and a guard that the override block still
existed. Three layers of fighting a dependency is a signal to check the
dependency, not a design to refine.

## What was verified before reverting

Not from release notes — by running both versions. 1.10 was installed into a
scratch directory, the pre-change deltas checked out in a throwaway worktree, and
one live scenario deleted from a `MODIFIED` block:

```
0.15.0 →  Change 'add-latin-repeats-support' is valid
1.10.0 →  ✗ [ERROR] salad/spec.md: MODIFIED "…" omits scenario(s) the current
          spec still has: "Generation is reproducible from a seed".
```

The upgrade was then rehearsed on a throwaway worktree before being run for real:
`openspec update` is non-destructive by default; forced, it removed exactly the
18-line managed block plus one stray blank from `AGENTS.md`, correctly resolved
the `CLAUDE.md → AGENTS.md` symlink and edited the target once; `openspec init`
is purely additive; `openspec/specs/` and all 914 files of
`openspec/changes/archive/` came through byte-identical per `git`.

## What survived, and why

1. **The three converted deltas are kept as `ADDED`.** They are correct, upstream
   recommends `ADDED` for a change that adds a concern, and reverting them to
   `MODIFIED` would reintroduce three stale copies to buy nothing.
2. **The Slide finding, which is a genuine bug no checker can catch.**
   `add-slide-keyboard-control`'s delta modified *"Slide input, movement and
   completion"* while its prose announced removing a sentence that lives in
   *"Slide game implements the Game interface"* — a requirement the change had no
   delta for. Archiving it would have published a spec declaring a keyboard
   player's exclusion removed while leaving it in force one requirement above.
   Both requirements were scenario-complete, so neither the hand-written check
   nor upstream's could see it. **A delta can be faithful to the wrong original**,
   and `AGENTS.md` now says to grep the live spec for the sentence first.
3. **The pin and the floor**, which are the actual fix:
   `scripts/checks/openspec-version.mjs` plus `openspec validate --all --strict`
   in the commit gate.

## The transferable rule

**The feeling of fighting a tool is a signal to check its version, not a design
problem to solve.** Three commands and two minutes — `npm view <pkg> version`,
the installed version, the CHANGELOG — before scoping any workaround. And a tool
that decides what the specs say is part of the build: if the repository does not
name its version, *"has this been fixed upstream?"* is unanswerable from inside
the repository, which is how a nine-month-old CLI came to gate the workflow
unnoticed.
