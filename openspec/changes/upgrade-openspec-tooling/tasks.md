# Tasks — upgrade-openspec-tooling

## 0. Decisions — settled

- [x] 0.1 **Revert `retire-modified-spec-deltas`.** Owner, 2026-08-24: *"bump and
      proceed with the upgrade."* `MODIFIED` is legal again and the tool enforces
      it; the override block, both guards and the ADDED-only rule are gone. Kept:
      the three converted deltas (correct as `ADDED`, and reverting them would
      reintroduce three stale copies to buy nothing) and the §2.2 Slide finding.
- [x] 0.2 **Both** — global bumped (the owner uses openspec across several
      projects and wanted the archive protection everywhere without per-project
      work) **and** pinned as a repo devDependency, so this repo states its own
      version rather than inheriting the machine's.
- [x] 0.3 Telemetry, new in 1.x: opted **out** globally
      (`openspec config set telemetry.enabled false`). Sending usage data to an
      external service is not a default to assume on someone's behalf; reversible
      with `... true`.

## 1. Baseline

- [x] 1.1 `openspec validate --all --strict` on 0.15.0 → **80 passed, 0 failed**.
- [x] 1.2 Recorded `HEAD` (`16afc09`), 209 archive dirs / **914 archive files**,
      70 spec files.
- [x] 1.3 Marker inventory: the `OPENSPEC:START/END` block in `AGENTS.md`,
      `openspec/OPENSPEC_AGENTS.md`, `openspec/project.md`, and the gitignored
      `.claude/commands/openspec/`.

> **Rehearsed before it was run.** The whole migration was executed first on a
> throwaway `git worktree` in the scratchpad against a scratch-installed 1.10, so
> the real run had no unknowns. That is what turned up the symlink question
> (`update` names both `CLAUDE.md` and `AGENTS.md`; this repo's `CLAUDE.md` is a
> symlink to `AGENTS.md`) *before* it could matter.

## 2. Upgrade

- [x] 2.1 Global `npm i -g @fission-ai/openspec@1.10.0` — deliberately npm, not
      `brew install`: brew's formula targets the same `/opt/homebrew/bin/openspec`
      path the existing npm symlink owns, and two package managers owning one path
      is its own problem. Pinned locally as a devDependency (`^1.10.0`).
- [x] 2.2 `openspec update --force` then `openspec init --force --tools claude`.
      Read the diff: **19 deletions from `AGENTS.md`, all of them the managed
      block plus one stray blank line** — no project content touched. The
      `CLAUDE.md → AGENTS.md` symlink was resolved correctly and the target edited
      once. `update` also removed the stale 0.x `.claude/commands/openspec/`;
      `init` added `.claude/commands/opsx/`, `.claude/skills/openspec-*` and
      `openspec/config.yaml`.
- [x] 2.3 `openspec validate --all --strict` → 80 passed, matching 1.1.
- [x] 2.4 `openspec/specs/` and all 914 files of `openspec/changes/archive/`
      **byte-identical to `HEAD` per `git`**.

> **An instrument check, in a change about instrument checks.** The first
> archive-integrity comparison used `find … -exec shasum {} \; | shasum`, and the
> hashes differed while the file count did not — which reads as "the migration
> rewrote history". It had not: that pipeline is **order-dependent** and `find`'s
> order is not guaranteed stable. `git status`/`git diff` settled it in one line,
> being the authority for tracked files. Cross-check against something outside
> the tool.

## 3. Reconcile the workaround

- [x] 3.1 Deleted `openspec/OPENSPEC_AGENTS.md` (orphaned — 1.x looks for
      `openspec/AGENTS.md`, which the rename dance meant never existed here, so
      nothing would ever have cleaned it up), the override block inside it, and
      `src/openspec-delta-integrity.test.ts`.
- [x] 3.2 Kept the Slide fix, and promoted its lesson into `AGENTS.md`: **a delta
      can be faithful to the wrong original**, so grep the live spec for the
      sentence you mean to change and confirm which requirement holds it.
- [x] 3.3 Rewrote `AGENTS.md` § "Work management" — all four verbs available, the
      tool keeps `MODIFIED` honest, `ADDED` preferred for an added concern, and
      the incident kept with its *real* resolution.
- [x] 3.4 `retire-modified-spec-deltas` withdrawn: change directory removed,
      postmortem at
      `openspec/postmortems/2026-08-24-retire-modified-spec-deltas-withdrawal.md`,
      implementation preserved at `db23e69` / `7431d7c`.

## 4. Close the open questions this touches

- [x] 4.1 `AGENTS.md` "Known unresolved questions" — the instruction-filename
      entry is **closed by removal, not by configuration**: 1.x generates no
      instruction file, so there is no name to configure. The question had assumed
      its answer must be a setting.
- [x] 4.2 Version floor: `scripts/checks/openspec-version.mjs`, reading the floor
      from `package.json` so the pin and the floor are one number, plus
      `openspec validate --all --strict` in the gate (~1 s).
- [x] 4.3 **Proved the floor fires** — faked the pin to `^0.15.0`: *"the pin
      '^0.15.0' is below 1.6.0, where 'openspec archive' began refusing to drop a
      scenario the live requirement still has."* Also fired on the pin being
      absent entirely.

> **The restored mechanism was exercised against real work, and caught a real
> mistake.** This change's own `repo-layout` edit was first written as `MODIFIED`
> keeping all three scenario *names* — valid. Renaming the one whose name had
> become false (*"openspec instructions are at OPENSPEC_AGENTS.md"*, now asserting
> that no such file exists) made `openspec validate` refuse it, because a renamed
> scenario reads as a dropped one. That is the guard working, so the requirement
> was retired and replaced under a truthful name instead. **A scenario name is
> the requirement's identity; a name that contradicts its body cannot be edited
> into truth.**

## 5. Verify

- [x] 5.1 Full gate green — 267 files / 7306 passed, down exactly the one file
      and four tests of the deleted guard and nothing else, which is the check
      that a deletion did not quietly take a neighbour with it. The gate's new
      `openspec validate --all --strict` step runs in ~1 s.
- [x] 5.2 Archived **this** change end-to-end on the committed tree, which
      exercises the restored `REMOVED` + `ADDED` path rather than a toy one:
      openspec reported `+ 2 added, ~ 0, - 1 removed`, the spec went 23 → 24
      requirements, and the diff touched **only** the three requirement headers
      and their own scenarios — no neighbouring requirement altered. Reverted
      with `git reset --hard` + `git clean -fd openspec/changes/`, since
      archiving waits on owner acceptance.

## 6. Close out

- [ ] 6.1 Owner acceptance, then archive.
