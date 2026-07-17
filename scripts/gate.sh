#!/usr/bin/env sh
# The pre-commit gate, in one place so `.husky/pre-commit` and `npm run gate`
# cannot drift (the build-pipeline spec requires they mirror each other).
#
# Order and semantics:
#   1. Fast fail-fast prefix — `tsc -b --noEmit`, then `biome lint`. A type or
#      lint error fails here in seconds without spending the heavy branches.
#   2. Heavy checks — `vitest run` and `vite build`. They share no inputs or
#      outputs, so on a machine with spare cores they run concurrently and the
#      gate wall-clock is ~max(vitest, build) instead of their sum (~40s off the
#      critical path). The gate fails if EITHER fails; blocking semantics are
#      unchanged.
#
# `vite build` stays in the gate because tsc/lint/vitest never exercise the
# production build, so a broken build (vite-plugin closeBundle crashes,
# unresolved `?raw`/asset imports, plugin/dep regressions) is otherwise
# invisible until deploy — exactly how two such bugs sat undetected on main.
# `tsc` already covers the `tsc &&` half of `npm run build`, so run `vite build`
# directly (leaner, no double typecheck). Assumes `npm run build:wasm` has
# populated src/assets/puzzles/ (the same precondition `npm run build`
# documents).
#
# ADAPTIVE CONCURRENCY. Running the all-core `vite build` concurrently with
# vitest is a clear win when cores are free, but on an already-saturated box it
# oversubscribes the CPU (and memory) and starves vitest's heaviest
# seed-deterministic tests past their 60s timeout — measured: at high external
# load the concurrent build reliably flaked dsf / netslide-hint, while the same
# suite ran green when the build was serialised. Reliability is the gate's
# first duty, so this script probes spare capacity and only parallelises when
# the box can afford it; otherwise it runs the build *after* vitest. The
# fallback is always the safe serial path, so a misjudged probe costs at most
# the parallelism win, never a spuriously-blocked commit.
set -e

# --- 0. Reap orphaned vitest workers from a previously-interrupted run. ---
# A sync-blocked worker survives its parent's death and spins a core forever
# (see scripts/reap-orphaned-workers.sh). Reaping here rather than relying on
# the `pretest:run` hook below is deliberate: orphans inflate the load average
# that the concurrency probe reads a few lines down, so a box left dirty by an
# earlier Ctrl-C would be misjudged "busy" and serialise the build for nothing.
# Fail-safe and near-free (one `ps` scan), so it costs a clean box nothing.
sh "$(dirname -- "$0")/reap-orphaned-workers.sh" || true

# --- 1. Fast fail-fast prefix. ---
npx tsc -b --noEmit
npm run lint

# --- Decide: can we afford to build concurrently? ---
# Concurrent only when the 1-minute load average leaves at least ~1 core of
# headroom beyond the machine's core count (room for the build without
# oversubscribing vitest). Any probe failure falls through to serial (safe).
cores=$(getconf _NPROCESSORS_ONLN 2>/dev/null || echo 4)
load=$(uptime 2>/dev/null | sed -n 's/.*load average[s]*:[[:space:]]*\([0-9][0-9]*[.,][0-9][0-9]*\).*/\1/p' | tr ',' '.')
concurrent=0
if [ -n "$load" ] && awk "BEGIN{exit !($load < $cores - 1)}" 2>/dev/null; then
  concurrent=1
fi

# `nice` (weak on macOS but free insurance) keeps the background build below
# vitest when they do overlap.
if command -v nice >/dev/null 2>&1; then
  NICE="nice -n 19"
else
  NICE=""
fi

# --- 2. Heavy checks. ---
vitest_rc=0
build_rc=0

if [ "$concurrent" -eq 1 ]; then
  echo "gate: box has spare capacity (load $load / $cores cores) — vitest ∥ vite build"
  # vitest streams live (the useful signal); vite build runs quietly and its
  # captured log is printed only on failure, avoiding two interleaved streams.
  build_log=$(mktemp)
  trap 'rm -f "$build_log"' EXIT
  $NICE npx vite build >"$build_log" 2>&1 &
  build_pid=$!

  npm run test:run || vitest_rc=$?
  wait "$build_pid" || build_rc=$?
  if [ "$build_rc" -ne 0 ]; then
    echo ""
    echo "✗ vite build failed (exit $build_rc):"
    cat "$build_log"
  fi
else
  echo "gate: box is busy (load ${load:-unknown} / $cores cores) — vitest then vite build (serial, avoids oversubscription)"
  npm run test:run || vitest_rc=$?
  # Only spend the build if vitest passed — a serial box has no time to waste,
  # and a red test run already blocks the commit.
  if [ "$vitest_rc" -eq 0 ]; then
    npx vite build || build_rc=$?
  fi
fi

if [ "$vitest_rc" -ne 0 ] || [ "$build_rc" -ne 0 ]; then
  echo ""
  echo "pre-commit gate failed (vitest=$vitest_rc build=$build_rc)"
  exit 1
fi
