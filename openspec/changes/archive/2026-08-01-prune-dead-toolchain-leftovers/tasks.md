# Tasks — prune-dead-toolchain-leftovers

- [x] 1.1 Delete `.clang-format` (tracked; `Language: Cpp`, no C/C++ in the tree).
- [x] 1.2 Delete `build/` on disk (65 MB of CMake/Emscripten output) and drop
      `/build/` from `.gitignore`.
- [x] 1.3 Delete `.cache/` on disk (2.6 MB clangd index) and drop its
      `.gitignore` stanza, which names host-native C builds explicitly.
- [x] 1.4 Delete `.vscode/settings.json` — its one setting pointed
      `cmake.sourceDirectory` at the removed `puzzles/`. Untracked, so this is a
      local delete with no repo effect; recorded for completeness.
- [x] 2.1 `repo-layout` root requirement: `dist/` replaces `build/` among the
      entry-point directories, and add the rule that configuration for a removed
      toolchain is removed with it.
- [x] 3.1 Confirm nothing references the deleted paths. The only `build/` hits
      are fixture-regeneration comments in the differential tests, which
      describe a harness that is itself deleted and are correct as history.
- [x] 4.1 Gate green (`vite build` is the real check that nothing wrote to
      `build/`); `openspec validate prune-dead-toolchain-leftovers --strict`.
- [ ] 4.2 Archive, then commit.

## The audit behind this

Every top-level entry was examined. Kept, with the reason:

| Entry | Why it stays |
|---|---|
| `src/`, `help/`, `licences/`, `openspec/`, `docs/` | Load-bearing. |
| `public/` | `dependencies-app.json` is a **live** dev-time placeholder the About dialog fetches at `${BASE_URL}dependencies-app.json` (production overwrites it via rollup-plugin-license); plus `404.html`, `robots.txt`, `favicon.svg`, `unsupported.js`. |
| `scripts/` | `build-manual.sh`, `gate.sh`, `new-game-port.sh`, `reap-orphaned-workers.sh`, and three advisory colour checks (`colour-{collide,dark-check,inventory}.test.ts`) plus `diff.vitest.config.mts`. The `.test.ts` files sit outside `vitest.config.ts`'s `include: ["src/**/*.test.ts"]` **by design** — they are run by hand, not by the gate. |
| `templates/`, `vite-plugins/` | Named homes the root requirement already mandates. |
| `.github/`, `.husky/`, `.claude/` | CI, the gate, agent config. |
| `Brewfile` | halibut alone since `retire-c-engine`; verified. |
| `.nvmrc`, `CLAUDE.md` → `AGENTS.md` | Node version pin; the documented symlink. |
| `dist/`, `tsconfig.tsbuildinfo` | Gitignored, regenerated. (`dist-stats.html`, a rollup-plugin-visualizer artifact, was deleted locally — also gitignored.) |

**The pattern worth keeping.** This is the third change in a row where what
outlived `retire-c-engine` was not the mechanism but the *configuration around*
it — `.gitattributes` un-vendoring three deleted files, `biome.json` excluding a
tree that had moved, and now a C++ formatter config, a clangd index, an ignore
rule and an editor setting. None of them fail. Each one tells the next reader
the C build is still here. **When removing a toolchain, grep for its name in
every dotfile, not just in the source.**
