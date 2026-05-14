#!/bin/bash
# Build the characterization-harness binaries from puzzles/auxiliary/ on the
# host machine, into /build/native/. See openspec/specs/build-pipeline/spec.md
# for the partitioning rationale.
#
# Run from the repo root:
#   ./scripts/build-native.sh                  # builds the default target (random-trace)
#   ./scripts/build-native.sh tree234-test     # builds the named target(s)
#
# Harnesses are run on demand (when fixtures need regenerating), so there's
# no npm wrapper for this script — it's only invoked by humans/agents
# refreshing a corpus, not by `npm run build:assets`.
#
# This script invokes cmake directly (no emcmake), which leaves
# CMAKE_SYSTEM_NAME at its native value (Darwin/Linux/etc.). setup.cmake
# routes any non-Emscripten system name to platforms/native.cmake, which
# is the minimal GTK-less path that supports the cliprogram() targets
# under puzzles/auxiliary/.

set -euo pipefail
if [ "${DEBUG:-0}" != "0" ]; then
  set -x
fi


# --- Environment configuration options ---
# JOBS: number of parallel builds to run, default is number of processors.
JOBS=${JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)}


# --- Directories ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SRC_DIR="${REPO_ROOT}/puzzles"
BUILD_DIR="${REPO_ROOT}/build/native"

if [ ! -d "${SRC_DIR}" ]; then
  echo "Puzzles source not found at ${SRC_DIR}" >&2
  exit 2
fi

if ! command -v cmake >/dev/null 2>&1; then
  echo "cmake not found. Install via: brew bundle install" >&2
  exit 3
fi


# --- Targets ---
# Positional args are cmake target names. Default is the random.c harness.
TARGETS=("$@")
if [ "${#TARGETS[@]}" -eq 0 ]; then
  TARGETS=(random-trace)
fi


# --- Build process ---
CMAKE_ARGS=(
  -B "${BUILD_DIR}"
  -S "${SRC_DIR}"
)

cmake "${CMAKE_ARGS[@]}"
(
  cd "${BUILD_DIR}"
  make -j"${JOBS}" "${TARGETS[@]}" VERBOSE="${VERBOSE:-}"
)

if [ "${DEBUG:-0}" != "0" ]; then
  echo "[DEBUG] Built targets in ${BUILD_DIR}/auxiliary:"
  ls -l "${BUILD_DIR}/auxiliary" 2>/dev/null || true
fi
