#!/bin/bash
# Build the wasm puzzles + manual on the host machine using brew-installed
# Emscripten (see Brewfile). Writes deliverables into src/assets/puzzles/.
#
# Run from the repo root:
#   ./scripts/build-emcc.sh
# or via the npm wrapper:
#   npm run build:wasm

set -euo pipefail
if [ "${DEBUG:-0}" != "0" ]; then
  set -x
fi


# --- Environment configuration options ---
# VCSID: revision identifier -- e.g., "$(git rev-parse --short HEAD)"
VCSID=${VCSID:-unknown}
# BUILDDATE: YYYYMMDD
BUILDDATE=${BUILDDATE:-$(date +%Y%m%d)}
BUILDTYPE=${BUILDTYPE:-Release}
# BUILD_UNFINISHED: semicolon-separated list of unfinished puzzles to also build
#   -- e.g., BUILD_UNFINISHED="group;sokoban"
BUILD_UNFINISHED=${BUILD_UNFINISHED:-}
# JOBS: number of parallel builds to run, default is number of processors.
# `nproc` ships with coreutils on macOS (see Brewfile); fall back to
# `sysctl` and finally to 1.
JOBS=${JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)}
# USE_TS_LEAVES: tri-state umbrella that routes every leaf-library call
# to its TypeScript port (USE_TS_RANDOM, future USE_TS_COMBI, …).
#   unset → inherit CMake's default (currently ON; the operational mode)
#   "0"/"OFF"/"off" → force pure C (escape hatch for bisecting or
#       running against the upstream C oracle)
#   truthy → force hybrid TS+C (redundant with default; useful for
#       overriding a previously-cached OFF)
# The Vite/worker side mirrors the same default via VITE_USE_TS_LEAVES;
# the coherence check refuses to start if WASM and Vite disagree. See
# openspec/specs/build-pipeline/spec.md.
USE_TS_LEAVES=${USE_TS_LEAVES:-}
# USE_TS_RANDOM: per-module override for the random.c bridge. "1"/"ON"
# turns random on even when the umbrella is off; "0"/"OFF" turns it off
# even when the umbrella is on. Bridge dispatches via
# puzzles/random_bridge.js (see openspec/specs/random/spec.md). Pair the
# worker side with VITE_USE_TS_RANDOM if you set this without the umbrella.
USE_TS_RANDOM=${USE_TS_RANDOM:-}


# --- Directories ---
# Resolve repo root from this script's location, so the script works no matter
# the cwd of the caller (npm run, IDE, etc.).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SRC_DIR="${REPO_ROOT}/puzzles"
BUILD_DIR="${REPO_ROOT}/build/wasm"
DIST_DIR="${REPO_ROOT}/src/assets/puzzles"
DIST_DIR_MANUAL="${DIST_DIR}/manual"

if [ ! -d "${SRC_DIR}" ]; then
  echo "Puzzles source not found at ${SRC_DIR}" >&2
  exit 2
fi

# Confirm emcmake is on PATH; give a helpful pointer if not.
if ! command -v emcmake >/dev/null 2>&1; then
  echo "emcmake not found. Install via: brew bundle install" >&2
  echo "(or set EMSDK_DIR / activate your own emsdk install before running.)" >&2
  exit 3
fi


# --- Build process ---
echo "[INFO] Building wasm puzzles and docs..."
BINARY_VERSION="1,${BUILDDATE:0:4},${BUILDDATE:4:2},${BUILDDATE:6:2}"
VERSION="${VCSID}"
VER="Version ${VERSION}"

CMAKE_ARGS=(
  -B "${BUILD_DIR}"
  -S "${SRC_DIR}"
  -DCMAKE_BUILD_TYPE="${BUILDTYPE}"
  -DCMAKE_C_FLAGS="-DVER='\"${VER}\"' -DVERSIONINFO_BINARY_VERSION='${BINARY_VERSION}'"
  -DPUZZLES_ENABLE_UNFINISHED="${BUILD_UNFINISHED}"
  -DVCSID="${VCSID}"
)

case "${USE_TS_LEAVES}" in
  "")
    ;;
  "0"|"OFF"|"off")
    CMAKE_ARGS+=(-DUSE_TS_LEAVES=OFF)
    echo "[INFO] USE_TS_LEAVES=OFF: every leaf stays on C (pure-C escape hatch; pair with VITE_USE_TS_LEAVES=0 on the worker side, or accept the silent reverse-coherence path)"
    ;;
  *)
    CMAKE_ARGS+=(-DUSE_TS_LEAVES=ON)
    echo "[INFO] USE_TS_LEAVES=ON: every leaf-library C implementation excluded; bridging to TS (redundant with default; useful when overriding a cached OFF)"
    ;;
esac

# Per-module USE_TS_RANDOM is tri-state:
#   unset → inherit from USE_TS_LEAVES (default OFF)
#   "0"/"OFF"/"off" → explicit override OFF (even under the umbrella)
#   anything else → explicit override ON
case "${USE_TS_RANDOM}" in
  "")
    ;;
  "0"|"OFF"|"off")
    CMAKE_ARGS+=(-DUSE_TS_RANDOM=OFF)
    echo "[INFO] USE_TS_RANDOM=OFF: random.c stays on C (per-module override of USE_TS_LEAVES)"
    ;;
  *)
    CMAKE_ARGS+=(-DUSE_TS_RANDOM=ON)
    echo "[INFO] USE_TS_RANDOM=ON: random.c excluded; bridging to TS via random_bridge.js"
    ;;
esac

emcmake cmake "${CMAKE_ARGS[@]}"
(
  cd "${BUILD_DIR}"
  make -j"${JOBS}" VERBOSE="${VERBOSE:-}"
)


# --- Deliverables ---
echo "[INFO] Delivering..."

mkdir -p "${DIST_DIR}"
rm -rf "${DIST_DIR}"/*

# Public deliverables
mkdir -p "${DIST_DIR_MANUAL}"
cp "${BUILD_DIR}"/help/en/*.html "${DIST_DIR_MANUAL}" || echo "[WARN] No HTML docs files found."

# Assets deliverables
# The emcc runtime wrapper is the same for all puzzles (differing only in the name
# of the imported wasm file). Pick an arbitrary one to use as a shared runtime.
# (See loadPuzzleModule() in src/puzzle.)
cp "${BUILD_DIR}"/nullgame.js "${DIST_DIR}/emcc-runtime.js" \
  || echo "[WARN] nullgame.js not found in ${BUILD_DIR}."
# Clean up EmbindString in emit-tsd output. (Yes, any embind-wrapped function that
# accepts a string can also take an ArrayBuffer, etc., but return values and
# value object fields are always standard JS strings.)
sed -e '/type EmbindString/d' -e 's/EmbindString/string/g' \
  "${BUILD_DIR}"/nullgame.d.ts > "${DIST_DIR}/emcc-runtime.d.ts" \
  || echo "[WARN] nullgame.d.ts found in ${BUILD_DIR}."

# Then deliver all of the puzzle-specific wasm files (and related sourcemaps).
shopt -s nullglob  # (release builds don't generate .map files)
cp "${BUILD_DIR}"/*.{wasm,map} "${DIST_DIR}/" \
  || echo "[WARN] No .wasm files found in ${BUILD_DIR}."
if [[ -d "${BUILD_DIR}/unfinished" ]]; then
  cp "${BUILD_DIR}"/unfinished/*.{wasm,map} "${DIST_DIR}/" \
    || echo "[WARN] No unfinished .wasm files found."
fi
if [[ -d "${BUILD_DIR}/unreleased" ]]; then
  cp "${BUILD_DIR}"/unreleased/*.{wasm,map} "${DIST_DIR}/" \
    || echo "[WARN] No unreleased .wasm files found."
fi
shopt -u nullglob

cp "${BUILD_DIR}/catalog.json" "${DIST_DIR}/" || echo "[WARN] No catalog.json found."
if [[ -f "${BUILD_DIR}/source-file-list.txt" ]]; then
  cp "${BUILD_DIR}/source-file-list.txt" "${DIST_DIR}/"
fi
if [[ -f "${BUILD_DIR}/dependencies.json" ]]; then
  cp "${BUILD_DIR}/dependencies.json" "${DIST_DIR}/"
fi
