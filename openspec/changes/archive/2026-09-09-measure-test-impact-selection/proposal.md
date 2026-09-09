# measure-test-impact-selection

Owner question, 2026-09-09:

> "is there some sort of tree-shaking test runner we could use, so that we only
> run tests actually downstream of each particular commit's modifications?"

**Answer: the tooling exists, it is already installed, and it is unsound for
this repository — measured, not predicted.** `build-pipeline` required exactly
this demonstration before any such scheme could be authorized; the demonstration
has now been run and it comes out negative.

## Why this is a change rather than a reply

The reply would be lost. The repo already carries the *prediction* — "a
graph-based selection **may** omit exactly the guards that exist to catch a
change to one game" — and a later session would have to re-derive whether that
was true. It is, and this change replaces the conjecture with the numbers so the
question is closed rather than re-opened.

## What was measured

`vitest related` (built in, no new dependency) walks the **static import graph**.

**Experiment 1 — a game source change.** `vitest related src/games/sixteen/index.ts`
selects **33 of 301 files** (1,794 of 8,510 tests). Encouraging until you ask
what is missing. Five cross-game guards that read game source as *text* through
`import.meta.glob` — and import nothing from `games/` — are **all absent**:

| missed guard | what it would have caught |
| --- | --- |
| `engine/color/palette-departures.test.ts` | a game departing from the twelve-color palette |
| `engine/color/palette-source.test.ts` | a palette claim a game's source contradicts |
| `palette-override-claims.test.ts` | a `render.ts` override that claims what it does not do |
| `engine/hint-refusal.test.ts` | a refusal literal a game spells its own way |
| `engine/note-vocabulary.test.ts` | note vocabulary drift |

`engine/raised-bevel.test.ts`, `module-layering.test.ts`, `dialog-dismissal.test.ts`,
`gate-scope.test.ts` and `asset-integrity.test.ts` glob `**/*.ts` and are absent
for the same reason.

**Experiment 2 — a help page change.** `vitest related help/games/sixteen.md`
reports **"No test files found"**. Three guards exist to check exactly those
files: `help-coverage.test.ts` (both directions between the directory and the
catalog), `help-command-links.test.ts`, `puzzle/catalog-aliases.test.ts`. A
help-only commit would run **zero** tests while three guards sit unrun.

That second result is the sharper one, and the gate already half-knew it:
`build-pipeline` says **"`help/` SHALL NOT be skippable"** in the
documentation-only fast path, for precisely this reason. The static selector
does not know it.

## Why this repo is a worst case, and it is not an accident

`AGENTS.md` § "Convention over configuration" requires that a cross-game guard
find its population by reading **what a game is** — the registered object, the
`Ui` its `newUi` returns, *its own comment-stripped source* — never a manifest.
Three attempts to build a manifest here were reversed. **26 test files** now
reach their subjects through `import.meta.glob(..., "?raw")` as a direct
consequence.

A static import graph cannot see a file that is read as text. So the deliberate
design that makes the guards impossible to forget is the same design that makes
them invisible to import-graph selection. Selecting on that graph would quietly
switch off the guards this project most relies on — and it would do so
*silently*, which is the failure shape `AGENTS.md` § "Method" exists to catch.

## The alternatives, and why none is adopted now

| approach | mechanism | verdict |
| --- | --- | --- |
| `vitest related` / `--changed` | static import graph | **unsound here** — measured above |
| [`vitest-affected`](https://github.com/craigvandotcom/vitest-affected) | runtime `importDurations`, cached reverse map | would fix the `?raw` edges, but **1 GitHub star**, single-project only, and `import.meta.glob` is absent from its own coupling-channels table. Not a dependency to put *inside* the gate |
| `testpick` / per-test coverage | runtime coverage map | same promise, same immaturity; the article's own rule is "when in doubt, run more, never less" |
| [Datadog Test Impact Analysis](https://docs.datadoghq.com/tests/test_impact_analysis/setup/javascript/) | coverage, skips whole files | SaaS, CI-oriented; wrong shape for a solo PWA's pre-commit hook |
| Nx / Turborepo affected | project graph, per package | needs a monorepo; this is one package |

**The honest summary: the sound approaches are immature, and the mature approach
is unsound.** Runtime coverage *is* the right mechanism — it sees what a test
actually read — and if a first-party or well-adopted implementation appears, the
experiments above are the acceptance test for it and are cheap to re-run.

## What is cheaper, and already done

The audit a day earlier cut the suite **~25%** by measurement
(`retire-tests-that-do-not-earn-their-runtime`, `defer-the-sixteen-deep-search-walks`)
without weakening the gate at all. The gate also already scopes by role where it
is provably safe: biome checks staged files in the hook and the whole tree in
CI, and a documentation-only commit skips vitest and the build — with `help/`
excluded from that shortcut, and an assertion that fails if a skippable path
ever becomes a test input. **That is the same idea as impact selection, applied
where the safety can be proved rather than hoped for.**

## Impact

- Affected specs: `build-pipeline` — one `ADDED` requirement recording the
  measurement and closing the question, so the existing conjecture stops being
  the only thing on record.
- Affected code: none. **No dependency is added.**
- Owner acceptance: not required — this answers a question with a measurement
  and adds no behavior.
