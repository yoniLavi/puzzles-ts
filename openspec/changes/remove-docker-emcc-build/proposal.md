# Change: Remove Docker from the wasm + icons build pipeline

## Why

The Docker-based wasm build was the dominant cost driver in
`wire-random-to-wasm`: roughly 25 of the 40 minutes that change took were
spent waiting on cold container rebuilds (~4 min × ~6 iterations).
PLAN.md captures this as sizing data; the project's remaining seam ports
(tree234 → dsf → drawing → per-puzzle → midend) will each repeat the
same wait pattern unless we shrink the inner loop.

The original case for Docker was reproducibility: a pinned Emscripten
image guarantees identical builds across contributors. That bargain is
much less valuable here than in a typical project:

- This is a full rewrite, not an upstream that needs to stay byte-compatible
  with a long tail of consumers; we control both ends of the build.
- The puzzles' native (non-wasm) build *already* works locally on the
  dev machine (halibut, cmake, jq are installed and used by the
  in-tree characterization harnesses).
- The only Docker-only piece is the wasm toolchain itself; `emsdk` ships
  via brew on macOS and Linuxbrew, so reproducibility moves from "fixed
  image tag" to "fixed brew formula version" — a small step down, well
  worth the iteration-cycle win.

Docker Desktop also costs noticeable RAM on the dev machine. Removing
the dependency frees that up without affecting the deliverable.

## What Changes

- **Add `Brewfile`** at repo root listing the native build tools the
  project now expects: `emscripten` (the emsdk toolchain), `halibut`
  (manual generation), `jq` (dependency manifest), `imagemagick` (icon
  rasterisation), plus any existing deps `Docker/` was carrying.
- **Replace `Docker/build-emcc.sh`** with a native variant that runs
  `emcmake cmake … && make …` directly on the host; outputs land in the
  same `src/assets/puzzles/` location so no downstream code changes.
- **Replace `Docker/build-icons.sh`** with a native variant (`imagemagick`
  + the in-tree icon pipeline). Same output location as today.
- **BREAKING (for contributors)**: delete `Docker/build-emcc.Dockerfile`,
  `Docker/build-icons.Dockerfile`, `Docker/emcmake-wrapper.sh`. Drop the
  `Docker/` directory once empty.
- **Update README** to: install via `brew bundle`, then run the two
  scripts. Remove all `podman run …` / `docker run …` instructions.
- **Add npm scripts** (`build:wasm`, `build:icons`) wrapping the two
  scripts so the entry points are discoverable from `package.json`.
- **Verify** both flag-OFF and flag-ON (`USE_TS_RANDOM=1`) wasm builds
  succeed natively; smoke-test that 3–5 puzzles render in dev.

**Out of scope**:
- A CI pipeline. The project doesn't currently have CI; adding one is
  its own change.
- Pinning emsdk to a specific version below brew's granularity. If
  drift becomes a problem in practice, a `.emscripten-version` file
  is a follow-up.

## Impact

- **Affected specs**: new `build-pipeline` capability (single
  requirement: "Build runs natively, no container runtime").
- **Affected code**:
  - `Brewfile` (new)
  - `Docker/` (deleted)
  - `scripts/build-emcc.sh` or similar (new — exact path TBD; could also
    stay at the project root as `build-emcc.sh`)
  - `scripts/build-icons.sh` (new, ditto)
  - `README.md` — installation + build sections rewritten
  - `package.json` — new wrappers
  - `PLAN.md` — close the iteration-latency follow-up flagged in the
    `wire-random-to-wasm` reflection note.
- **Risk**:
  - Contributors must install emsdk + imagemagick locally. Mitigation:
    `brew bundle` is a single command; README walks through it.
  - Brew formula version drift between contributors. Mitigation: pin
    in the Brewfile via `version "X.Y.Z"` syntax where the formula
    supports it; otherwise document the expected version in README.
  - `emsdk` brew formula on Linux is sometimes more involved than on
    macOS. Mitigation: README has a "Linux notes" subsection if needed.
- **Migration / rollback**: if the native build breaks, the Docker
  files can be resurrected from git history — they're being deleted in
  this change, not retired in place.
