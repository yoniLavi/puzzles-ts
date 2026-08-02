# refile-misplaced-artefacts

## Why

Two directories hold committed non-code artefacts that their stated role does not
cover, and in both cases the mismatch attaches the **wrong obligation** to the
contents.

### `docs/tilings/` — upstream's diagrams, which the code already routes around

`docs/` has one spec'd purpose: *"Developer-facing prose guides (the how-to of
porting and feature work, distinct from the /help in-app user docs) SHALL live
under `docs/`"* — and `AGENTS.md` attaches an obligation to it in bold: *"Treat
these as a live wiki, not frozen docs… every time you hit something the guide
didn't tell you, **update the guide in the same change** — that is part of
'done'."*

`docs/tilings/` is 564 KB of **unmodified upstream material** — Simon Tatham's
hat/spectre construction diagrams, 25 SVGs and two HTML pages, MIT-licensed with
the rest of the collection, which we may not edit. It sits beside
`docs/porting/game-port-playbook.md` and `docs/test-strength.md`, which are ours
and which every session is told to keep current. One directory, two contradictory
instructions.

It got there honestly: `retire-c-engine` rescued it from `puzzles/auxiliary/doc/`
because it documents *live TypeScript* (`engine/tilings/`) rather than deleted C,
and `docs/` was the least-wrong shelf available at the time. But the repository
already has the distinction this needs, spelled out for the help system: **the
split is by authorship** — `help/upstream/` is verbatim upstream material with a
README pointing at the licence; everything else under `help/` is ours. The same
rule, applied a second time, answers this cleanly.

**And then checking who points at them settled it the other way: delete, don't
move.** `hat.ts`'s own header already says *"Read Simon Tatham's write-up before
this file — the algorithm is genuinely unobvious and the diagrams do not fit in a
comment"* — and links the **live upstream URL**
(`chiark.greenend.org.uk/~sgtatham/quasiblog/aperiodic-tilings/`), not the local
copy. So the pointer a reader needs already exists, already works, and goes to
the maintained source. The 564 KB in `docs/tilings/` is the thing nothing points
at: its only reference in the entire repository is one bullet in `AGENTS.md`.

Keeping a second, unreferenced copy of a document the code links to elsewhere is
not preservation; it is a fork of someone else's page that no one will ever
notice diverging. It is recoverable from git history and from upstream's own
repository if a future session ever wants it offline.

### `metrics/` — a finished round's snapshots, reading as current measurement

The repository root has an entry-point directory holding 1 MB of raw tool output:

```
metrics/2026-08-01/                 complexity.json, cycles{,-raw}.txt, jscpd/, knip.txt, summary.md
metrics/2026-08-01-config-helpers/  (same six)
metrics/2026-08-01-after/           (same six)
metrics/mutation/report.json
```

Three of the four are **dated snapshots of a refactoring round that finished**.
Their value was the diff between them, and that diff has been read, acted on and
written up. Only `metrics/mutation/report.json` is still a live input
(`docs/test-strength.md` reads it). A finished round's output left at the root
reads as current measurement of the current tree, which is exactly what it is
not — and it cannot be refreshed, because it measures a tree that no longer
exists.

This repository has a settled convention for it, and it is not "leave it at the
root": *the audit's **findings** are committed under the change; its scratch is
not*, and `retire-c-engine` filed the two unbuildable C reference sources under
the changes that read them — because `openspec archive` then carries a reference
into the archive with the work that consumed it.

## What Changes

- **Delete `docs/tilings/`** — 564 KB, 25 SVGs and two HTML pages, referenced
  from one bullet in `AGENTS.md` and from nowhere in the code, duplicating a page
  `hat.ts` already links by URL. Confirm `spectre.ts` carries the same pointer
  `hat.ts` does, and add it if not: **the link is what is load-bearing, not the
  copy.**
- **Move the three dated metrics snapshots** under the archived changes that
  produced them, keeping each `summary.md` with its own raw output.
- **Keep `metrics/` for live instruments only** — currently just
  `mutation/report.json`.
- **`scripts/checks/`** — the four advisory `*.test.ts` files and
  `diff.vitest.config.mts` move there. They are the only tests in the repository
  outside `src/`, they are deliberately outside the gate, and nothing about
  `scripts/` (which otherwise means "things you run") says so.
- **Point Stryker's sandbox outside the project tree** and delete the 192 MB of
  stale `.stryker-tmp/sandbox-*` copies on disk.

Explicitly **not** in this change:

- **Deleting any measurement.** The snapshots are moved, not dropped: they are
  the baseline a future round would diff against and cannot be regenerated.
- **Deleting the *link* to upstream's write-up.** What `hat.ts` needs is the
  explanation; the local copy is not the explanation, it is a second copy of it.
- **Anything under `licences/`.** MIT's notice condition attaches to the ported
  code and is not discharged by the port being finished. They are also live build
  inputs — the About dialog `?raw`-imports both.

## Impact

- **Affected specs**: `repo-layout` — "Developer guides live under docs/ and link
  to specs" gains the rule that `docs/` holds this project's guides only, and
  that a reference is carried as a link to its maintained source rather than a
  copy; the root entry-point-directory list loses `metrics/`. `build-pipeline` —
  a round's snapshot is committed under the change that produced it.
- **Affected code**: no runtime code. `scripts/metrics.sh`,
  `scripts/stryker.config.mjs`, `scripts/diff.vitest.config.mts`,
  `package.json`'s `diff` script, one comment pointer in `engine/tilings/`,
  `AGENTS.md`, `docs/test-strength.md`, `docs/porting/game-port-playbook.md`.
- **Risk**: very low, with one thing worth naming — nothing here is imported by
  the app, so a broken path surfaces only when someone next runs the script.
  `npm run diff` and `npm run metrics` are therefore **run once** after the move
  rather than assumed.
