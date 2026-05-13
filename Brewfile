# Native build dependencies for the puzzles wasm + icons pipelines.
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

# Icon rasterisation: convert + identify.
brew "imagemagick"

# PNG re-compression at the end of build-icons.
brew "oxipng"

# Required to render the GTK puzzle binaries that the icon target screenshots.
# Headless (--screenshot) goes through Cairo and does not need a display.
brew "gtk+3"
brew "pkgconf"

# Build harness.
brew "cmake"

# `gnproc` for parallel-job detection inside build-*.sh on macOS.
# (The scripts fall back to `sysctl -n hw.ncpu` if missing, but coreutils
# is small and keeps the script identical to the Linux invocation.)
brew "coreutils"
