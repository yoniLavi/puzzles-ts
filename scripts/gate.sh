#!/usr/bin/env sh
# The pre-commit gate, in one place so `.husky/pre-commit` and `npm run gate`
# cannot drift (the build-pipeline spec requires they mirror each other).
#
# Order and semantics:
#   1. Fast fail-fast prefix — `tsc -b --noEmit`, then `biome ci`. A type, lint,
#      or formatting error fails here in seconds without spending the heavy
#      branches.
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
# CONCURRENCY. `vitest` and `vite build` share no inputs or outputs, so they
# always run concurrently and the gate's wall clock is ~max(vitest, build)
# rather than their sum.
#
# This used to probe the 1-minute load average and serialise on a busy box,
# because oversubscribing starved vitest's heaviest seed-deterministic tests
# past their 60s timeout (at high external load the concurrent build reliably
# flaked dsf / netslide-hint). That rationale is gone: no test is clock-gated
# any more — there is one 600s ceiling in vitest.config.ts and no per-test
# timeouts — so contention now makes a test *slower*, never *failed*. The probe
# only cost time: this box runs deliberately busy, so it read "busy" nearly
# always and put the build on the critical path for a danger that no longer
# exists. Reliability is still the gate's first duty; it is now bought by not
# gating on the clock rather than by hoarding cores.
set -e

# --- 0. Reap orphaned vitest workers from a previously-interrupted run. ---
# A sync-blocked worker survives its parent's death and spins a core forever
# (see scripts/reap-orphaned-workers.sh). Reaping up front rather than relying
# on the `pretest:run` hook below is deliberate: an orphan left by an earlier
# Ctrl-C would otherwise compete with this run for cores start to finish.
# Fail-safe and near-free (one `ps` scan), so it costs a clean box nothing.
sh "$(dirname -- "$0")/reap-orphaned-workers.sh" || true

# --- 1. Fast fail-fast prefix. ---
# `biome ci` rather than `biome lint`: it is the read-only form of `biome check`,
# so one ~3s pass covers lint rules AND formatting AND import order. Gating only
# `lint` left the tree lint-clean but never format-clean, so the first
# `biome check --write` (= `npm run check`) reformatted ~150 files nobody had
# touched and buried the real diff. `format --check` would not close it either:
# `check` also sorts imports, which `format` does not. `npm run check` stays the
# fixer — run it, then commit.
npx tsc -b --noEmit
npx biome ci .

# `nice` (weak on macOS but free insurance) keeps the background build below
# vitest, which is the branch that actually blocks the commit.
if command -v nice >/dev/null 2>&1; then
  NICE="nice -n 19"
else
  NICE=""
fi

# --- 2. Heavy checks, concurrently. ---
vitest_rc=0
build_rc=0

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

if [ "$vitest_rc" -ne 0 ] || [ "$build_rc" -ne 0 ]; then
  echo ""
  echo "pre-commit gate failed (vitest=$vitest_rc build=$build_rc)"
  exit 1
fi
