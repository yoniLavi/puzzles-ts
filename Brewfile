# Native build dependencies for the puzzles wasm pipeline.
#
# Install with:
#   brew bundle install
#
# Versions noted below are what the pipeline was last verified against.
# Drift past those is usually fine; large jumps in `emscripten` may shift
# wasm output enough to be noticeable — see scripts/build-emcc.sh and
# the byte-fidelity check in openspec/specs/random/spec.md.

# wasm toolchain (emcmake, emcc, etc.). Last verified: 5.0.7.
brew "emscripten"

# Doc generation for the in-app manual.
brew "halibut"

# JSON munging in the dependency-info / catalog post-processing.
brew "jq"

# Build harness.
brew "cmake"

# `gnproc` for parallel-job detection inside build-*.sh on macOS.
# (The scripts fall back to `sysctl -n hw.ncpu` if missing, but coreutils
# is small and keeps the script identical to the Linux invocation.)
brew "coreutils"

# --- Icon regeneration only ---
# The PNGs under src/assets/icons/ are committed snapshots; only install
# the deps below if you actually need to regenerate them via
# scripts/build-icons.sh (e.g. when adding a new puzzle to the catalog).
brew "imagemagick"   # icon rasterisation: convert + identify
brew "oxipng"        # PNG re-compression at the end of build-icons
brew "gtk+3"         # GTK puzzle binaries for headless --screenshot
brew "pkgconf"       # locate gtk+3 during cmake configure
