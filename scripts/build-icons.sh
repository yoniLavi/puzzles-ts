#!/bin/bash
# Build the puzzle icons on the host machine using brew-installed GTK+3 and
# ImageMagick (see Brewfile). Writes deliverables into src/assets/icons/.
#
# Run from the repo root:
#   ./scripts/build-icons.sh
# or via the npm wrapper:
#   npm run build:icons
#
# On macOS, CMake's platform autodetection picks puzzles/cmake/platforms/osx.cmake,
# which has no icon target. This script forces CMAKE_SYSTEM_NAME=Linux so the
# unix platform file is used; we also force CMAKE_CROSSCOMPILING=FALSE since
# CMake otherwise auto-flips it to TRUE when SYSTEM_NAME is overridden, and
# unix.cmake disables `build_icons` under cross-compilation. The GTK puzzle
# binaries then run with `--screenshot`, which uses Cairo's offscreen PNG path
# and needs no display.

set -euo pipefail
if [ "${DEBUG:-0}" != "0" ]; then
  set -x
fi


# --- Environment configuration options ---
# BUILD_UNFINISHED: semicolon-separated list of unfinished puzzles to also build
#   -- e.g., BUILD_UNFINISHED="group;sokoban"
#   (Note: icon generation doesn't currently consider unfinished puzzles.)
BUILD_UNFINISHED=${BUILD_UNFINISHED:-}
# JOBS: number of parallel builds to run, default is number of processors.
JOBS=${JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)}


# --- Directories ---
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SRC_DIR="${REPO_ROOT}/puzzles"
BUILD_DIR="${REPO_ROOT}/build/icons"
DIST_DIR_ICONS="${REPO_ROOT}/src/assets/icons"

if [ ! -d "${SRC_DIR}" ]; then
  echo "Puzzles source not found at ${SRC_DIR}" >&2
  exit 2
fi

# Confirm tools are present.
for tool in cmake convert oxipng; do
  if ! command -v "${tool}" >/dev/null 2>&1; then
    echo "${tool} not found. Install via: brew bundle install" >&2
    exit 3
  fi
done


# --- Build process ---
# Force the Unix/GTK platform file (puzzles/cmake/platforms/unix.cmake) on every
# host so the icon target is configured. On Linux this is already the default;
# on macOS this overrides the OS X bundle build path that has no icons.
CMAKE_ARGS=(
  -B "${BUILD_DIR}"
  -S "${SRC_DIR}"
  -DCMAKE_SYSTEM_NAME=Linux
  -DCMAKE_CROSSCOMPILING=FALSE
  -DPUZZLES_ENABLE_UNFINISHED="${BUILD_UNFINISHED}"
)
# Note: the prior Docker script also set -DSTRICT=ON to double as a strict-mode
# build check. Brew's gtk+3 / gdk-pixbuf are newer than Alpine's and surface
# upstream deprecation warnings (e.g., gdk_pixbuf_new_from_xpm_data) that
# -Werror then turns fatal. Strict-mode verification is incidental to the
# icons' purpose; drop it here to keep the icon path host-portable.

cmake "${CMAKE_ARGS[@]}"
(
  cd "${BUILD_DIR}"
  make -j"${JOBS}" icons VERBOSE="${VERBOSE:-}"
)

if [ "${DEBUG:-0}" = "2" ]; then
  echo "[DEBUG] Built ${BUILD_DIR}/icons:"
  ls -l "${BUILD_DIR}/icons"
fi

# --- Deliverables ---
mkdir -p "${DIST_DIR_ICONS}"
rm -rf "${DIST_DIR_ICONS}"/*

# The build produces some 32 versions of each puzzle's icons.
# Deliver the ones we're most likely to use:
#   puzzle-base.png: complete screenshot (varying sizes, not always square, 24bit)
#   puzzle-64d8.png / puzzle-128d8.png: 8-bit indexed icons at fixed sizes
cp "${BUILD_DIR}"/icons/*-base.png "${DIST_DIR_ICONS}/"
cp "${BUILD_DIR}"/icons/*-64d8.png "${DIST_DIR_ICONS}/"
cp "${BUILD_DIR}"/icons/*-128d8.png "${DIST_DIR_ICONS}/"

# Optimize the delivered icons in place.
oxipng -o max --zopfli --fast -s "${DIST_DIR_ICONS}"/*.png

if [ "${DEBUG:-0}" != "0" ]; then
  echo "[DEBUG] Delivered ${DIST_DIR_ICONS}:"
  ls -l "${DIST_DIR_ICONS}"
fi
