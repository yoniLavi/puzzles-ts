#!/bin/bash
# Build the in-app manual: halibut over upstream's `help/upstream/manual/puzzles.but`,
# producing one HTML page per puzzle in src/assets/manual/.
#
# The source lives at help/upstream/manual/ rather than help/manual/ on purpose:
# the manual is served under the URL subdirectory /help/manual/, and a real
# directory of that name shadows the generated page namespace (EISDIR at build).
#
# Run from the repo root:
#   ./scripts/build-manual.sh
# or via the npm wrapper:
#   npm run build:assets
#
# This used to be a side-effect of the Emscripten build — `build_platform_extras()`
# in puzzles/cmake/platforms/webapp.cmake ran halibut, and scripts/build-emcc.sh
# copied the result out of the cmake build tree. halibut has nothing to do with
# Emscripten (it is its own brew tool), so `retire-c-engine` kept the halibut
# invocation and dropped the wasm compilation around it. This script is what is
# left: the whole asset build is now one doc generator.
#
# The output is gitignored and regenerated on demand. It is optional in the
# sense that the app builds without it — the manual pages simply do not exist,
# and each puzzle's overview page omits its "manual" link (see the `manpage`
# lookup in vite.config.ts). Deleting a stale output tree first is deliberate:
# halibut writes one file per chapter, so a chapter that goes away upstream
# would otherwise linger for ever.

set -euo pipefail
if [ "${DEBUG:-0}" != "0" ]; then
  set -x
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

SRC="${REPO_ROOT}/help/upstream/manual/puzzles.but"
OUT_DIR="${REPO_ROOT}/src/assets/manual"

if [ ! -f "${SRC}" ]; then
  echo "Manual source not found at ${SRC}" >&2
  exit 2
fi

if ! command -v halibut >/dev/null 2>&1; then
  echo "halibut not found. Install via: brew bundle install" >&2
  exit 3
fi

# Match the options the cmake build passed, so the generated HTML — and the
# fragment ids the overview pages link to (`manual/<name>#<name>`) — are
# unchanged by the move.
HALIBUT_OPTIONS=(
  "-Chtml-template-fragment:%k"
  "-Chtml-chapter-shownumber:false"
  "-Chtml-section-shownumber:0:false"
)

echo "[INFO] Building the manual with halibut..."
rm -rf "${OUT_DIR}"
mkdir -p "${OUT_DIR}"
(
  cd "${OUT_DIR}"
  halibut --html "${HALIBUT_OPTIONS[@]}" "${SRC}"
)

echo "[INFO] Manual written to ${OUT_DIR} ($(find "${OUT_DIR}" -name '*.html' | wc -l | tr -d ' ') pages)."
