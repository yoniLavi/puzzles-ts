# prune-dead-toolchain-leftovers

## Why

A sweep of every top-level entry, asked for after `rehome-upstream-help-sources`
removed `puzzles/`. Most of the tree earns its place. Four things do not, and
all four are residue of the C toolchain that `retire-c-engine` removed:

- **`.clang-format`** — a **tracked** `Language: Cpp` formatter config, 50 lines
  of C++ brace and indent policy, in a repository with no C or C++ in it. It is
  the last configuration file for a language this project does not contain.
- **`build/`** — 65 MB of the dead CMake/Emscripten tree still on disk:
  `CMakeCache.txt`, `CMakeFiles/`, `compile_commands.json`, `wasm/`,
  `unreleased/`, `unfinished/`, `icons/`, `auxiliary/`. Untracked, so it
  survived every commit that deleted its inputs.
- **`.cache/`** — 2.6 MB clangd index, described by its own `.gitignore` comment
  as "created during host-native C builds". There are none.
- **`.vscode/settings.json`** — one setting, `cmake.sourceDirectory`, pointing
  at `…/puzzles`, a directory that no longer exists. Untracked (gitignored), so
  this is a local delete, noted here only for completeness.

`retire-c-engine` said the `build/` directory and its ignore entry were "kept
for whatever comes next". Nothing came, and meanwhile the **root-layout
requirement lists `build/` as an entry-point directory and does not list
`dist/`** — so the spec names the empty slot and omits the real build output.
That is the one substantive correction here; the rest is deleting bytes.

The recurring shape, third time in three changes: `retire-c-engine` removed the
mechanism, and what outlived it was the *configuration around* the mechanism —
a formatter config, an ignore rule, an editor setting, an index. None of it
fails; all of it tells the next reader the C build is still there.

## What Changes

- **Delete `.clang-format`.** If C ever returns to this repo it will not be
  formatted to the 2011-era LLVM profile this file encodes.
- **Delete `build/` on disk and its `.gitignore` entry.** Nothing writes there.
  The real build output is `dist/`, already ignored.
- **Delete `.cache/` on disk and its `.gitignore` entry** (the stanza names
  clangd and host-native C builds explicitly).
- **Fix the root-layout requirement**: `dist/` replaces `build/` in the list of
  entry-point directories, and the requirement gains the rule the last three
  changes have each rediscovered — a config file, ignore rule or editor setting
  for a removed toolchain is deleted *with* it.
- `.vscode/` deleted locally (untracked; no repo effect).

**Everything else at the root was examined and kept**, with the reason:
`public/` (`dependencies-app.json` is a live dev-time placeholder the About
dialog fetches, plus `404.html`, `robots.txt`, `favicon.svg`, `unsupported.js`),
`scripts/` (the manual build, the gate, the port scaffolder, the worker reaper,
and three advisory colour checks that are deliberately outside `vitest.config.ts`'s
`src/**/*.test.ts` include), `templates/`, `vite-plugins/`, `docs/`, `help/`,
`licences/`, `openspec/`, `src/`, `.github/`, `.husky/`, `.claude/`, `Brewfile`
(halibut alone since `retire-c-engine`), `.nvmrc`, and the `CLAUDE.md` →
`AGENTS.md` symlink.

## Impact

- Affected specs: `repo-layout` (root-layout requirement).
- Affected code: none. `.gitignore` and one deleted config file; no source, no
  build config, no test. `grep` confirms nothing references `build/` or
  `.cache` except historical fixture-regeneration comments in the differential
  tests, which correctly describe a harness that no longer exists.
- Risk: minimal, and the gate covers it — if anything did write to `build/`,
  `vite build` in the pre-commit gate would fail.

## Depends on

- **`rehome-upstream-help-sources`** — archived. It removed `puzzles/`, which is
  what prompted looking at the rest of the root.
