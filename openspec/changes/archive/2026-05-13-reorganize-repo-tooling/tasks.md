# Tasks

## 1. Consolidate build dirs under `/build/`

- [x] 1.1 Update `scripts/build-emcc.sh` so `BUILD_DIR` is
  `${REPO_ROOT}/build/wasm` (was `build/emcc`).
- [x] 1.2 Update `scripts/build-icons.sh` so `BUILD_DIR` is
  `${REPO_ROOT}/build/icons` (unchanged) — confirm only.
- [x] 1.3 Fix the three stale `puzzles/build-webapp.` strings in
  `scripts/build-emcc.sh`'s WARN messages to use `${BUILD_DIR}`.
- [x] 1.4 In `.gitignore`, remove `/puzzles/build/` (the existing
  top-level `/build/` rule covers the consolidated layout).
- [x] 1.5 Sweep PLAN.md, CLAUDE.md, and `puzzles/auxiliary/` README/scripts
  for `puzzles/build` references; update to `/build/native/`. (Only
  PLAN.md had a live reference; updated.)

## 2. Move Vite plugins

- [x] 2.1 `git mv vite-extra-pages.ts vite-plugins/extra-pages.ts`,
  `git mv vite-wasm-sourcemaps.ts vite-plugins/wasm-sourcemaps.ts`.
- [x] 2.2 Update the two imports in `vite.config.ts` to point at
  `./vite-plugins/extra-pages` and `./vite-plugins/wasm-sourcemaps`.
- [x] 2.3 Confirm `tsc -b` still resolves the moved files.
- [x] 2.4 Update README's "Web app code" section to reference the new
  path.

## 3. Move HTML templates

- [x] 3.1 `git mv {index,puzzle}.html.hbs templates/`,
  `git mv _headers.txt.hbs templates/`.
  (**Deviation from proposal**: `unsupported.html` stays at root. Moving
  it to `templates/` broke vite-plugin-sitemap, which enumerates rollup
  outputs and chokes on the `templates/`-prefixed path. The spec was
  amended to clarify: handlebars templates → `templates/`; static rollup
  inputs MAY stay at the root.)
- [x] 3.2 Update every `renderHandlebars({ file: "..." })` in
  `vite.config.ts` to prefix `templates/`.
- [x] 3.3 `unsupported.html` allowlist entry left unchanged
  (file stays at root per the deviation above).
- [x] 3.4 Update README's "Web app code" section to reference
  `templates/`.

## 4. Drop Wrangler

- [x] 4.1 Delete `wrangler.toml`.
- [x] 4.2 Remove `"wrangler": "^4.83.0"` from `devDependencies` in
  `package.json`.
- [x] 4.3 Remove `"preview:pages"` from `scripts` in `package.json`.
- [x] 4.4 `npm install` to refresh `package-lock.json`.
- [x] 4.5 Sweep README, PLAN.md, CLAUDE.md, `openspec/project.md` for
  any remaining wrangler / Cloudflare-Pages references; remove or
  reframe. (openspec/project.md updated; PLAN.md historical entry kept;
  vite.config.ts + templates/_headers.txt.hbs comments left in place as
  known-format references.)

## 5. Verify

- [x] 5.1 `npm run build:wasm` (flag OFF) lands artefacts in
  `src/assets/puzzles/` (consumer-visible path unchanged).
- [x] 5.2 `USE_TS_RANDOM=1 npm run build:wasm` (flag ON) ditto.
- [x] 5.3 `npm run build:icons` lands artefacts in `src/assets/icons/`.
- [x] 5.4 `npm run dev` boots; home, `/cube`, `/help/` all return 200.
- [ ] 5.5 `npm run build && npm run preview` produces a working preview.
  **Skipped — pre-existing breakage**: `npm run build` was already failing
  on HEAD (before any of my tooling changes) with
  `vite-plugin-sitemap: ENOENT 'dist/robots.txt'` during `closeBundle`.
  Confirmed by running `npm run build` on a clean baseline worktree at
  HEAD. Not in scope here; should be filed as a separate change.
- [x] 5.6 `vitest run` passes (random characterization replay included,
  6/6 tests pass).
- [ ] 5.7 The random-trace harness's `-B` flag is not currently wired
  into a script. The harness's documented invocation (in the archived
  `port-random-to-typescript` change) used `puzzles/build/`. Anyone
  re-running it now should pass `-B /build/native` instead; no
  automation needs updating in this change.
- [x] 5.8 `git grep wrangler` returns 0 hits in tracked files outside
  the intentional past-tense mention in `openspec/project.md`.

## 6. Spec sync

- [ ] 6.1 After landing, `openspec archive reorganize-repo-tooling --yes`
  promotes both spec deltas (`build-pipeline` MODIFIED, `repo-layout`
  ADDED).
