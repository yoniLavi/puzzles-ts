# Tasks

## 1. Inventory the existing Docker pipeline

- [ ] 1.1 List every tool, env var, and apt package consumed by
  `Docker/build-emcc.sh` / `Docker/build-icons.sh`. Cross-reference
  against `Docker/build-emcc.Dockerfile` and `Docker/build-icons.Dockerfile`
  so nothing falls off the boat (jq, halibut, python3, imagemagick,
  typescript via npm, etc.).
- [ ] 1.2 Confirm each dependency has a brew formula (and note the
  specific name — e.g. `emscripten` vs. `emsdk`).

## 2. Brewfile + install docs

- [ ] 2.1 Create `Brewfile` at repo root listing every dependency from §1.
- [ ] 2.2 Verify `brew bundle install --no-upgrade` runs cleanly on the
  dev machine; record the resolved versions.
- [ ] 2.3 README "Getting started" rewritten: replace the `podman build`
  / `podman run` blocks with `brew bundle && npm install` and the two
  new build scripts.
- [ ] 2.4 Note in README how to override emsdk version (set
  `EMSDK_DIR` or activate a specific emsdk install) for contributors
  who maintain a separate emsdk install.

## 3. Native build-emcc

- [ ] 3.1 Move `Docker/build-emcc.sh` to a host-runnable location
  (proposal suggests `scripts/build-emcc.sh`; final path TBD with the
  user). Strip the container-relative paths (`/app/puzzles`, `/app/build`,
  `/app/assets`) and replace with the repo's own layout
  (`./puzzles`, `./build/emcc`, `./src/assets`).
- [ ] 3.2 Keep the env-var surface from the docker version:
  `BUILDTYPE`, `BUILD_UNFINISHED`, `VCSID`, `BUILDDATE`,
  `GENERATE_SOURCE_MAPS`, `JOBS`, `DEBUG`, `VERBOSE`, **and**
  `USE_TS_RANDOM` (from wire-random-to-wasm).
- [ ] 3.3 Run the script: confirm it produces a `src/assets/puzzles/`
  identical (modulo build date / VCSID) to the docker version's output.
- [ ] 3.4 Run with `USE_TS_RANDOM=1` and confirm the bridged build
  produces wasms with the `random_*` env imports as it did under docker.

## 4. Native build-icons

- [ ] 4.1 Mirror §3 for `Docker/build-icons.sh` → host runnable.
- [ ] 4.2 Confirm output matches the existing
  `src/assets/icons/` byte-for-byte (or visually for PNGs).

## 5. npm script wrappers

- [ ] 5.1 Add `"build:wasm": "scripts/build-emcc.sh"` and
  `"build:icons": "scripts/build-icons.sh"` (or chosen paths) to
  `package.json`.
- [ ] 5.2 Optional: add a `build:all` that runs both.

## 6. Delete the Docker pipeline

- [ ] 6.1 `git rm Docker/build-emcc.Dockerfile Docker/build-icons.Dockerfile
  Docker/emcmake-wrapper.sh Docker/build-emcc.sh Docker/build-icons.sh`.
- [ ] 6.2 If `Docker/` is now empty, `rmdir Docker/` (or remove via git).
- [ ] 6.3 Grep the repo for stale references (`podman`, `docker run`,
  `build-emcc`, `Dockerfile`) and clean.

## 7. End-to-end verification

- [ ] 7.1 Native build flag-OFF: 5-puzzle smoke test in dev server
  (cube/flip/mines/loopy/solo), 0 console errors.
- [ ] 7.2 Native build flag-ON: same smoke test with `VITE_USE_TS_RANDOM=1`.
- [ ] 7.3 Byte-fidelity recheck: rerun the §5.3 protocol from
  `wire-random-to-wasm` (Solo seed `3x3#786954740169111` →
  `formatAsText` MD5 `d704406cde2b755bf708f9dc543b1c96`) on the
  natively-built flag-ON wasm to prove the rebuild path is equivalent.
- [ ] 7.4 Time a cold build end-to-end. Update PLAN.md with the
  before/after delta — concrete data for sizing the seam ports to come.

## 8. Wrap

- [ ] 8.1 Update PLAN.md: close the "Docker → native emsdk migration"
  follow-up flagged in `wire-random-to-wasm/design.md`.
- [ ] 8.2 Run `openspec validate remove-docker-emcc-build --strict`.
