# tidy-measurement-artefacts

## Why

The repository root has an entry-point directory called `metrics/` holding 1 MB
of raw tool output from a refactoring round that finished:

```
metrics/2026-08-01/               complexity.json, cycles{,-raw}.txt, jscpd/, knip.txt, summary.md
metrics/2026-08-01-config-helpers/  (same six)
metrics/2026-08-01-after/           (same six)
metrics/mutation/report.json
```

Three of those four are **dated snapshots of a finished round** — `2026-08-01`,
the mid-round `-config-helpers`, and `-after`. Their value was the diff between
them, and that diff has been read, acted on, and written up. Only
`metrics/mutation/report.json` is still a live input: `docs/test-strength.md`
reads it.

This repository has a settled convention for exactly this, and it is not "leave
it at the root": *the audit's **findings** are committed under the change; its
scratch is not* (`.gitignore`, on `.stryker-tmp/`), and `retire-c-engine` filed
the two unbuilt C reference files under the changes that read them, with the
reasoning that `openspec archive` then carries a reference into the archive along
with the work that consumed it. A dated snapshot from `establish-refactor-baseline`
belongs with `establish-refactor-baseline`.

Two smaller things of the same kind:

- **`scripts/` holds four `*.test.ts` files** — `colour-inventory`,
  `colour-collide`, `colour-dark-check`, plus the `diff.vitest.config.mts` that
  runs them. They are advisory, deliberately outside the gate, and they are the
  only tests in the repository that do not live under `src/`. Nothing signals
  that from the directory name; `scripts/` otherwise means "things you run".
- **Stryker writes its sandboxes into `.stryker-tmp/` inside the project** — five
  full copies of the tree, **192 MB**, still on disk from the last mutation run.
  Gitignored, so this is a disk-and-noise issue rather than a repo-contents one,
  but a tool that copies the whole tree into the tree is worth pointing
  elsewhere.

None of this is urgent. It is filed as its own change because its reason is its
own: *one-off measurement output was committed at the root and never relocated
when its round ended.*

## What Changes

- **Move the three dated snapshots** to the archived changes that produced them
  (`openspec/changes/archive/2026-08-01-establish-refactor-baseline/metrics/` and
  the round's later changes), keeping `summary.md` alongside its raw output so
  the numbers stay checkable.
- **Keep `metrics/` for live instruments only** — currently just
  `mutation/report.json`, which `docs/test-strength.md` reads. Repoint
  `scripts/metrics.sh` so the *next* round writes its dated directory wherever
  the spec then says.
- **`scripts/checks/`** — move the four advisory `*.test.ts` files and
  `diff.vitest.config.mts` there, so `npm run diff` names a directory that says
  what it holds.
- **Point Stryker's sandbox outside the project tree** (`tempDirName`), and
  delete the 192 MB currently sitting in `.stryker-tmp/`.

Explicitly **not** in this change:

- **Deleting any measurement.** The dated snapshots are moved, not dropped: they
  are the baseline a future round would diff against, and they cannot be
  regenerated for a tree that no longer exists.
- **Changing what `npm run metrics` measures**, or its standing as a diagnostic
  rather than a gate.

## Impact

- **Affected specs**: `build-pipeline` — "Refactoring metrics are measured on
  demand and ratcheted in the gate" currently requires the output be committed
  "under a dated `metrics/` directory"; it needs to say where a *finished*
  round's snapshot lives. `repo-layout` — `metrics/` leaves the root's
  entry-point-directory list.
- **Affected code**: `scripts/metrics.sh`, `scripts/stryker.config.mjs`,
  `scripts/diff.vitest.config.mts`, `package.json`'s `diff` script,
  `docs/test-strength.md`, `docs/porting/game-port-playbook.md`.
- **Risk**: very low. Nothing here is imported by the app; the failure mode is a
  broken path in an on-demand script, which surfaces the first time it is run —
  so both scripts SHALL be run once after the move rather than assumed.
