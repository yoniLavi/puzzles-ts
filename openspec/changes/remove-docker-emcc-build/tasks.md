# Tasks

## 1. Inventory the existing Docker pipeline

- [x] 1.1 List every tool, env var, and apt package consumed by
  `Docker/build-emcc.sh` / `Docker/build-icons.sh`. Cross-reference
  against `Docker/build-emcc.Dockerfile` and `Docker/build-icons.Dockerfile`
  so nothing falls off the boat (jq, halibut, python3, imagemagick,
  typescript via npm, etc.).
- [x] 1.2 Confirm each dependency has a brew formula (and note the
  specific name — e.g. `emscripten` vs. `emsdk`).

## 2. Brewfile + install docs

- [x] 2.1 Create `Brewfile` at repo root listing every dependency from §1.
- [x] 2.2 Verify `brew bundle install --no-upgrade` runs cleanly on the
  dev machine; record the resolved versions.
- [x] 2.3 README "Getting started" rewritten: replace the `podman build`
  / `podman run` blocks with `brew bundle && npm install` and the two
  new build scripts.
- [x] 2.4 Note in README how to override emsdk version (set
  `EMSDK_DIR` or activate a specific emsdk install) for contributors
  who maintain a separate emsdk install.

## 3. Native build-emcc

- [x] 3.1 Move `Docker/build-emcc.sh` to `scripts/build-emcc.sh`. Strip
  the container-relative paths (`/app/puzzles`, `/app/build`,
  `/app/assets`) and replace with the repo's own layout
  (`./puzzles`, `./build/emcc`, `./src/assets`).
- [x] 3.2 Keep the env-var surface from the docker version:
  `BUILDTYPE`, `BUILD_UNFINISHED`, `VCSID`, `BUILDDATE`,
  `GENERATE_SOURCE_MAPS`, `JOBS`, `DEBUG`, `VERBOSE`, **and**
  `USE_TS_RANDOM` (from wire-random-to-wasm).
- [x] 3.3 Run the script: confirm it produces a `src/assets/puzzles/`
  identical (modulo build date / VCSID) to the docker version's output.
- [x] 3.4 Run with `USE_TS_RANDOM=1` and confirm the bridged build
  produces wasms with the `random_*` env imports as it did under docker.

## 4. Native build-icons

- [x] 4.1 Mirror §3 for `Docker/build-icons.sh` → `scripts/build-icons.sh`.
  Force `CMAKE_SYSTEM_NAME=Linux` + `CMAKE_CROSSCOMPILING=FALSE` so the
  GTK platform file is selected and the icon target stays enabled on
  macOS hosts. Drop `STRICT=ON` (brew's gdk-pixbuf is newer than
  Alpine's; -Werror trips on upstream deprecation warnings — strict-mode
  was incidental to the icon build's purpose).
- [x] 4.2 Confirm output matches the existing `src/assets/icons/`
  byte-for-byte (or visually for PNGs).

## 5. npm script wrappers

- [x] 5.1 Add `"build:wasm": "scripts/build-emcc.sh"` and
  `"build:icons": "scripts/build-icons.sh"` to `package.json`.
- [x] 5.2 Optional: add a `build:all` that runs both. (Shipped as
  `build:assets` for naming clarity vs. the existing `build` script.)

## 6. Delete the Docker pipeline

- [x] 6.1 `git rm Docker/build-emcc.Dockerfile Docker/build-icons.Dockerfile
  Docker/emcmake-wrapper.sh Docker/build-emcc.sh Docker/build-icons.sh`.
- [x] 6.2 If `Docker/` is now empty, remove the dir (handled implicitly by
  the `git rm` above since no files remain).
- [x] 6.3 Grep the repo for stale references (`podman`, `docker run`,
  `build-emcc`, `Dockerfile`) and clean. Touched: `README.md`,
  `CLAUDE.md` (rewritten; `.aiassistant/` migrated in then removed),
  `openspec/project.md`, `openspec/specs/random/spec.md`. The
  `.github/workflows/build-deploy.yml` workflow is disabled in this
  fork (Cloudflare Pages account isn't ours) — kept on disk with a
  comment explaining the decision.

## 7. End-to-end verification

- [x] 7.1 Native build flag-OFF: 5-puzzle smoke test in dev server
  (cube/flip/mines/loopy/solo) — 0 console errors per puzzle (only the
  expected Lit dev-mode warning).
- [x] 7.2 Native build flag-ON: same smoke test with
  `VITE_USE_TS_RANDOM=1`. All 7 `random_*` env imports present in each
  of the 5 wasms; `npm run test:run` passes (random replay 6/6).
- [x] 7.3 Byte-fidelity recheck: Solo seed `3x3#786954740169111` →
  `formatAsText` MD5 `d704406cde2b755bf708f9dc543b1c96` reproduced
  exactly on the natively-built flag-ON wasm.
- [x] 7.4 Cold-build timings recorded: flag-OFF wasm 1:51, flag-ON wasm
  2:15, icons 1:12; incremental wasm rebuild ~2 s. PLAN.md entry
  closes the iteration-latency follow-up from
  `wire-random-to-wasm/design.md`.

## 8. Wrap

- [x] 8.1 PLAN.md updated: added the host-native build pipeline to "What's
  been done", with the cold/incremental timing delta vs. Docker.
- [x] 8.2 `openspec validate remove-docker-emcc-build --strict` passes.
