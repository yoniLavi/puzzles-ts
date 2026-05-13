# Change: Consolidate pre-seam structure (src/native, agent docs, build-native)

## Why

Three small structural debts are worth paying down before the next seam
(tree234/dsf/combi/...) lands, so the patterns are set once for the
half-dozen modules that follow.

1. **`src/native/` shape is half-done.** The `random` seam landed its
   fixtures and tests under `src/native/random/` but kept the
   implementation flat at `src/native/{random,sha1,random-bridge}.ts`.
   Adding six more leaf modules in the same flat shape would mix module
   internals with fixture/test folders, making the directory unreadable.
   Cheapest moment to pick a per-module shape is now, with one module
   in flight.
2. **Agent-facing docs are split across three files that drift.**
   `PLAN.md` carries strategic context, `CLAUDE.md` carries
   working-conventions, `AGENTS.md` is a thin openspec wrapper. Three
   homes for the same audience invites stale duplication
   (`CLAUDE.md` already says "no tests yet" while `PLAN.md` describes the
   landed test discipline). The user's preferred pattern (see
   `~/codeliance/codeliance-stack/evaluator`) is a single `AGENTS.md`
   with `CLAUDE.md` symlinked to it, plus a renamed
   `openspec/OPENSPEC_AGENTS.md` (to disambiguate from the project-root
   `AGENTS.md`).
3. **`build-pipeline` spec/reality drift.** The spec already says
   characterization harnesses build into `/build/native/`
   (`build-pipeline` scenario "Generated artefacts live under a single
   `/build/` root"), but no script implements this — the `random-trace`
   binary currently lands in `/build/icons/auxiliary/` as a side-effect
   of the icons build. The pattern only becomes load-bearing when the
   next seam needs to regenerate fixtures; fix it now while the harness
   inventory is one binary.

## What Changes

### 1. `src/native/` → per-module folder shape

Move each ported module under its own subdirectory:

- `src/native/random.ts` → `src/native/random/index.ts`
- `src/native/random-bridge.ts` → `src/native/random/bridge.ts`
- `src/native/sha1.ts` → `src/native/random/sha1.ts` (internal to
  `random`; if `misc.c`'s SHA callers later become their own seam, lift
  it back out)

Test + fixtures stay where they are
(`src/native/random/random.test.ts`,
`src/native/random/__fixtures__/corpus.json`) — they're already in the
right shape.

Update the three external imports:

- `src/puzzle/worker.ts`:
  `../native/random-bridge.ts` → `../native/random/bridge.ts`
- `puzzles/random_bridge.js` (the Emscripten `--js-library` shim):
  unchanged — it doesn't import TS, only declares C-visible symbols.
- `src/native/random/random.test.ts`: `../random.ts` → `../index.ts`.

### 2. Agent docs → single AGENTS.md, CLAUDE.md as symlink

- Rewrite `AGENTS.md` to be the single source of strategic context +
  conventions for AI assistants and human contributors. Folds in
  PLAN.md's strategic content (Goal, Lineage, Approach, Test
  discipline, Seam order, License, What's been done, Known unresolved
  questions) plus CLAUDE.md's working-conventions content (Build
  commands, Code conventions, DO/DO NOTs, Special files). The managed
  `<!-- OPENSPEC:START -->` block stays at the top and points at the
  renamed `openspec/OPENSPEC_AGENTS.md`.
- Replace `CLAUDE.md` (regular file) with `CLAUDE.md → AGENTS.md`
  (symlink). Claude Code reads `CLAUDE.md`; this keeps the two views
  byte-identical.
- Rename `openspec/AGENTS.md` → `openspec/OPENSPEC_AGENTS.md`. The
  rename avoids collision with the project-root `AGENTS.md` for tools
  or contributors that scan for `AGENTS.md` recursively. Update the
  managed block in `AGENTS.md` and the three slash-command stubs under
  `.claude/commands/openspec/{archive,apply,proposal}.md` to point at
  the new name.
- Delete `PLAN.md` once its content lives in `AGENTS.md`.
- Update the three references to `PLAN.md` inside `openspec/project.md`
  to point at the relevant `AGENTS.md` section.

### 3. Build-native script

- Add `scripts/build-native.sh` that configures cmake with
  `-B build/native -S puzzles -DCMAKE_SYSTEM_NAME=Linux
  -DCMAKE_CROSSCOMPILING=FALSE` and builds the requested target(s)
  (default `random-trace`). Modelled on the existing
  `scripts/build-icons.sh`.
- The icons build keeps its existing side-effect of compiling
  `puzzles/auxiliary/*` under `/build/icons/auxiliary/`. That's
  harmless; the canonical, scripted home for harness binaries is
  `/build/native/`.

### Non-goals

- **Not splitting `src/utils/`.** Still 22 small files; no obvious axis
  of split that isn't bikeshedding.
- **Not changing `src/screens/`, `src/dialogs/`, `src/components/`.**
  These were just reorganised; leave them alone.
- **Not adding a `build:native` npm wrapper.** Harnesses are run on
  demand (when fixtures need regenerating), not as part of the build.
  `scripts/build-native.sh` is the entry point.
- **Not touching the README** beyond fixing the medmunds-flavoured
  stale links. (Bigger README rewrite is a separate concern.)
- **Not codifying the agent-docs convention beyond
  `repo-layout/spec.md`.** No new spec capability.

## Impact

### Affected specs

- **`repo-layout`** (MODIFIED ×2, ADDED ×1):
  - MODIFIED `Repo root holds product-level config only` — drops
    `PLAN.md` from the top-level docs list (it's being deleted; its
    content lives in `AGENTS.md`).
  - MODIFIED `Source tree under src/ groups files by UI role` — adds a
    sub-clause specifying the per-module shape for `src/native/`.
  - ADDED `Agent-facing documentation lives in a single AGENTS.md` —
    new requirement covering the AGENTS.md/CLAUDE.md symlink/
    OPENSPEC_AGENTS.md pattern.
- **`build-pipeline`** (MODIFIED ×1):
  - MODIFIED `WASM and icon builds run on host-native tooling` — adds
    `scripts/build-native.sh` as the explicit owner of the
    `/build/native/` partition that the existing scenario already
    references.

### Affected code

- `src/native/*` — 3 file moves with `git mv`; 3 import updates inside
  the moved files; 1 import update in `src/puzzle/worker.ts`.
- `AGENTS.md` — rewritten.
- `CLAUDE.md` — replaced with a symlink to `AGENTS.md`.
- `openspec/AGENTS.md` → `openspec/OPENSPEC_AGENTS.md` (rename).
- `.claude/commands/openspec/{archive,apply,proposal}.md` — update the
  three "Refer to `openspec/AGENTS.md`" lines.
- `openspec/project.md` — replace three `PLAN.md` references with
  pointers into `AGENTS.md`.
- `PLAN.md` — deleted.
- `scripts/build-native.sh` — new.

### Verification

- `npm run check` clean.
- `npx tsc -b --noEmit` clean.
- `npm run test:run` green (random replay passes — proves the rename
  didn't break imports).
- `scripts/build-native.sh` produces `build/native/auxiliary/random-trace`,
  runs to completion, and emits a corpus that matches the current
  `src/native/random/__fixtures__/corpus.json` byte-for-byte.
- `readlink CLAUDE.md` returns `AGENTS.md`.
- `openspec validate consolidate-pre-seam-structure --strict` passes.
- `git log --follow src/native/random/index.ts` walks back into
  pre-move history.
