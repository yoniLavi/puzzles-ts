# Tasks — retire-native-directory

Three phases, each independently green. Phase 1 is the one with judgement in it;
phases 2 and 3 are mechanical and verified by shape.

## 1. Invert the engine→app dependency

- [ ] 1.1 `git mv src/puzzle/types.ts src/native/engine/types.ts` (it moves again
      in phase 2 with the rest of the engine — one `git mv` per phase keeps
      `--follow` walking). Rewrite its header: the Emscripten provenance is
      history worth keeping, but the sentence explaining why it lives in the app
      layer is now the sentence explaining why it no longer does.
- [ ] 1.2 Repoint its **201** importers. 182 are under `src/native/` and become
      engine-relative; the remainder are the app reaching *down*, which is the
      direction that was always intended.
- [ ] 1.3 `git mv src/native/engine/worker-adapter.ts src/puzzle/` and its test
      alongside. Fix its two upward imports (`puzzle/drawing.ts`,
      `puzzle/engine-surface.ts`) — now siblings — and the one import of it in
      `src/puzzle/worker.ts`.
- [ ] 1.4 Resolve the seven test-only upward reaches: `puzzle/catalog.ts` in
      `pencil-prefs.test.ts`, `custom-params.test.ts`, `touch-input.test.ts`,
      `games/catalog-registry.test.ts`; `utils/color.ts` in `colours.test.ts`,
      `palette.test.ts`, `crossing/crossing.test.ts`. Prefer moving the helper
      the test needs to the engine side over exempting the test — an exemption
      is how the current blocklist got its hole.
- [ ] 1.5 Rewrite `module-layering.test.ts` rule 3 as the D4 invariant: the
      engine and games import nothing under `src/` outside their own two
      directories, with `engine/testing/hint-games.ts` the single named
      exception.
- [ ] 1.6 **Verify the rule fires.** Add an import from an engine module to
      `src/utils/dom.ts`, run the file, observe red, revert. A layering rule that
      has never failed may not work, and this one's whole value is firing years
      from now.
- [ ] 1.7 Gate green: `npm run typecheck`, then the layering + engine test files.

## 2. Hoist the tree

- [ ] 2.1 `git mv src/native/engine src/engine` and `git mv src/native/games
      src/games`; `src/native/` is left holding only `combi/` and `random/`.
- [ ] 2.2 Confirm the import-neutrality claim rather than assuming it: after the
      move, `npm run typecheck` should report errors **only** for paths crossing
      out of the moved tree (`../../../puzzle/…` → one `../` too many), never for
      `"../../engine/…"`. If a cross-tree specifier broke, D2's premise was
      wrong and the layout choice needs revisiting, not patching.
- [ ] 2.3 `git mv src/native/random src/engine/random` and `git mv
      src/native/combi src/engine/combi`; `rmdir src/native`. Repoint their 255
      and 1 importers.
- [ ] 2.4 Repoint the enumerated external referrers — the full set, measured
      2026-08-02:
      - `src/module-layering.test.ts` (6 path constants)
      - `src/puzzle/{worker.ts, drawing.ts, augmentation.test.ts, catalog-data.ts}`
      - `scripts/feedback-probe.mjs` (the `ENGINE` const), `scripts/feedback-probe-cases.mjs` (14)
      - `scripts/stryker.config.mjs` (7), `scripts/new-game-port.sh` (4)
      - `scripts/colour-{inventory,collide,dark-check}.test.ts` (14),
        `scripts/diff.vitest.config.mts`, `scripts/metrics-summary.mjs`,
        `scripts/reap-orphaned-workers.sh`
- [ ] 2.5 `npm run probe -- --verify` passes. Per D7 this is the evidence the
      move was pure: the corpus anchors quote source *lines*, so a rename leaves
      them valid and a failure means something other than a rename happened.
- [ ] 2.6 Prose: `AGENTS.md`, `docs/porting/game-port-playbook.md` (125
      mentions), `docs/porting/hint-authoring.md` (63),
      `docs/test-strength.md`, `docs/tilings/README.md`. Sweep live claims;
      leave past-tense narration (D1).
- [ ] 2.7 Full gate: `npm run gate`. Confirm every `__snapshots__/*.snap` and all
      48 per-game differentials are untouched — a snapshot that moves during a
      rename means something else moved with it.
- [ ] 2.8 `git log --follow src/engine/midend.ts` and one moved game file walk
      back past the move.

## 3. Specs

- [ ] 3.1 `repo-layout` — MODIFIED "Source tree under `src/` groups files by UI
      role": new paths, and **delete the `src/native/<module>/` + `bridge.ts`
      category**. MODIFIED "The module layering is enforced, not merely
      observed": the D4 invariant. MODIFIED "A scaffolding script stamps out a
      new game-port skeleton": repointed.
- [ ] 3.2 `ts-engine` — ADDED "The engine owns its type vocabulary".
- [ ] 3.3 `random` — REMOVED "Bridge wires C random_* calls to the TypeScript
      implementation" (the mechanism is deleted) and REMOVED "Pre-commit hook
      enforces type-check, lint, and tests" (three steps out of date, and
      `build-pipeline` owns the real five-step gate). MODIFIED the two
      requirements naming module paths.
- [ ] 3.4 `combi` — MODIFIED the two requirements naming module paths.
- [ ] 3.5 Mechanical sweep of the remaining live path claims in
      `openspec/specs/` (23 in `ts-engine`, ~10 across per-game specs), then
      prove the sweep touched nothing else:
      ```sh
      git diff openspec/specs | grep '^[-+]' | grep -v '^[-+][-+]' \
        | grep -v 'src/native/\(engine\|games\)/'   # must print nothing
      ```
- [ ] 3.6 **Sweep the twelve *pending* changes under `openspec/changes/`** (not
      `archive/`) for paths this change invalidates: `src/native/*`,
      `src/puzzle/types.ts`, `worker-adapter.ts`, `src/native/{combi,random}/`.
      Measured 2026-08-02, twelve non-archived changes name them —
      `add-{path,numgame}-ts-port`, `add-game-difficulty-contract`,
      `add-latin-repeats-support`, `add-{clusters,sticks,subsets}-difficulty-tiers`,
      `bound-abcd-generable-sizes`, `refine-slide-appearance` and the sibling
      reorg changes.
      **A stale path in a pending change is worse than one in a spec or an
      archive: it is instructions someone is going to follow.** An archived
      change is history and a spec is read for its rule, but `tasks.md` in an
      unstarted change is a list of steps to execute, and the step "edit
      `src/native/games/sticks/solver.ts`" will be attempted verbatim.
- [ ] 3.7 `openspec validate retire-native-directory --strict`, and re-validate
      every pending change touched by 3.6.

## 4. Close out

- [ ] 4.1 Owner acceptance: `npm run dev`, play two games (one canvas-heavy, one
      hint-carrying) and confirm nothing regressed. A rename cannot change
      behaviour, but that sentence has been wrong before.
- [ ] 4.2 Archive with `openspec archive retire-native-directory`.
