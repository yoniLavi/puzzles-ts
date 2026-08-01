# fix-ci-after-c-retirement

## Why

`retire-c-engine` archived cleanly, and applying its deltas immediately exposed
what they had **not** covered. Three requirements and one live workflow still
describe machinery that change deleted:

1. **CI is broken on `main` right now, and this change is mostly about that.**
   `.github/workflows/ci.yml` installs emsdk (pinned to the Brewfile's
   Emscripten), apt-installs `jq`/`cmake`, caches `src/assets/puzzles/` keyed on
   `hashFiles('puzzles/**', 'scripts/build-emcc.sh')`, and runs
   `npm run build:wasm`. That npm script no longer exists, so the job fails at
   that step. **This is a regression introduced by `retire-c-engine`, not
   pre-existing drift** — the workflow was green before it and is red after.
2. **`build-pipeline`'s CI requirement encodes the same dead reasoning** —
   "there is no valid asset-free CI tier (a no-asset job fails at `tsc -b`)"
   was true only because `src/puzzle/{catalog,types,worker}.ts` imported
   generated artifacts. They no longer do: the catalog is committed source and
   the types are hand-authored, so an asset-free gate is not merely valid, it is
   the default.
3. **`ts-engine` still has two requirements written against the C path** — the
   midend "SHALL reproduce the existing Comlink `WorkerPuzzle` API surface"
   (that class is deleted), and "Per-game engine selection is a runtime
   registry, not a build flag", whose whole subject is choosing between TS and
   C/WASM and whose scenarios ("every catalog game loads and runs via its C/WASM
   implementation") cannot be satisfied by a repository with no C.

Why this is a separate change rather than an amendment: the archived change is
archived, and re-opening it to hide a miss is worse than recording the miss.

**The transferable lesson: a teardown's spec deltas are scoped from the code you
edit, and that misses every requirement that merely *describes* what you
deleted.** The three above were found by grepping the *applied* specs for the
names of the deleted machinery — a check worth running at the end of any
removal, because nothing else fails when a spec goes stale.

## What Changes

- **Rewrite `.github/workflows/ci.yml`** to the C-free shape: no emsdk, no
  `jq`/`cmake`, no asset cache, no `force_wasm_rebuild` dispatch input. Install
  `halibut`, run `npm run build:assets` (the manual), then `npm run gate`. The
  manual build stays in CI deliberately — it is now the *only* generated asset,
  and building it is what exercises `scripts/build-manual.sh` and the vite
  manual-page rendering path.
- **Restate the `build-pipeline` CI requirement** around a gate that needs no
  generated assets.
- **Restate the two `ts-engine` requirements** so they describe the engine that
  exists: the midend owns the app-facing Comlink surface (not "reproduces
  `WorkerPuzzle`"), and the registry maps `puzzleId` → `Game` with no fallback
  (not "selects between TS and C/WASM").

## Impact

- Affected specs: `build-pipeline` (CI requirement), `ts-engine` (two
  requirements).
- Affected code: `.github/workflows/ci.yml` only.
- Risk: the workflow is not exercised by the local gate, so it is verified by
  reading plus a `workflow_dispatch` run after this lands. Everything else is
  spec text.
