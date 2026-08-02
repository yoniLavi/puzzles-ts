# refile-misplaced-artefacts

## Why

Two directories hold committed non-code artefacts that their stated role does not
cover, and in both cases the mismatch attaches the **wrong obligation** to the
contents.

### `docs/tilings/` — upstream's diagrams, in the directory that must be kept current

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

One more thing the survey turned up: the diagrams are referenced from **exactly
one place in the entire repository** — a bullet in `AGENTS.md`. Neither `hat.ts`
nor `spectre.ts` points at the construction diagrams that explain the tables they
implement, so the material is effectively unreachable from the code it documents.
Relocating it without fixing that would be moving an orphan.

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

- **`docs/tilings/` → `docs/upstream/tilings/`**, mirroring the `help/upstream/`
  authorship convention so one rule covers both: *a directory named `upstream/`
  holds someone else's words, verbatim, and is not ours to keep current.* Its
  README (which already states the provenance and the licence) moves with it.
- **Link the diagrams from the code they document** — a pointer comment in
  `src/engine/tilings/hat.ts` and `spectre.ts`. Without this the relocation moves
  an orphan; with it, a reader of the kitemap tables can find the picture of what
  they mean.
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

- **Editing a word of the upstream diagrams.** Moving someone else's material is
  not a licence to revise it — the same rule that governed the help sources.
- **Deleting any measurement.** The snapshots are moved, not dropped: they are
  the baseline a future round would diff against and cannot be regenerated.
- **Serving the diagrams.** They are developer reference, not an in-app help
  page. `docs/upstream/`, not `help/upstream/`, precisely because everything the
  app serves is a build input and these are not.

## Impact

- **Affected specs**: `repo-layout` — "Developer guides live under docs/ and link
  to specs" gains the authorship boundary (and what `docs/` is *not*); the root
  entry-point-directory list loses `metrics/`. `build-pipeline` — a round's
  snapshot is committed under the change that produced it.
- **Affected code**: no runtime code. `scripts/metrics.sh`,
  `scripts/stryker.config.mjs`, `scripts/diff.vitest.config.mts`,
  `package.json`'s `diff` script, two comment pointers in `engine/tilings/`,
  `AGENTS.md`, `docs/test-strength.md`, `docs/porting/game-port-playbook.md`.
- **Risk**: very low, with one thing worth naming — nothing here is imported by
  the app, so a broken path surfaces only when someone next runs the script.
  `npm run diff` and `npm run metrics` are therefore **run once** after the move
  rather than assumed, and the two HTML pages are opened to confirm their
  relative `<img>` references to the SVGs survived the move.
