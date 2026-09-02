#!/usr/bin/env sh
# The pre-commit gate, in one place so `.husky/pre-commit` and `npm run gate`
# cannot drift (the build-pipeline spec requires they mirror each other).
#
# Order and semantics:
#   1. Fast fail-fast prefix — `tsc -b --noEmit`, then biome (lint + format +
#      import order), then the probe-anchor check (~0.2s). A type, lint,
#      formatting or rotted-anchor error fails here in seconds without spending
#      the heavy branches. The biome scope is per-commit (staged files, when the
#      hook sets GATE_BIOME_STAGED=1) or whole-tree (CI / manual `npm run gate`)
#      — see the branch below.
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
# directly (leaner, no double typecheck). Needs no generated assets at all: the
# catalog is committed source (`retire-c-engine`) and the manual, the last
# generated artifact, is deleted (`retire-the-upstream-help-tree`).
#
# CONCURRENCY. `vitest` and `vite build` share no inputs or outputs, so they
# always run concurrently and the gate's wall clock is ~max(vitest, build)
# rather than their sum.
#
# This used to probe the 1-minute load average and serialize on a busy box,
# because oversubscribing starved vitest's heaviest seed-deterministic tests
# past their 60s timeout (at high external load the concurrent build reliably
# flaked dsf / netslide-hint). The probe is still gone — it read "busy" nearly
# always on this deliberately-busy box and put the build on the critical path —
# but the claim that replaced it, "contention now makes a test *slower*, never
# *failed*", is NOT true without qualification and has since been falsified: it
# holds only up to the 600s ceiling in vitest.config.ts, and at load ~81 on 8
# cores two Sixteen hint tests (~50s each solo, 112s for the whole file) blew
# through it and failed this gate.
#
# The fix is not another timeout. It is to stop oversubscribing: vitest now caps
# its worker pool (`maxWorkers` in vitest.config.ts, leaving two cores free) and
# both heavy branches below run under `nice`, so a gate run yields to the
# developer's own work instead of competing with it. Reliability is still bought
# by not gating on the clock — now also by not starving the box.
set -e

# --- 0. Reap orphaned vitest workers from a previously-interrupted run. ---
# A sync-blocked worker survives its parent's death and spins a core forever
# (see scripts/reap-orphaned-workers.sh). Reaping up front rather than relying
# on the `pretest:run` hook below is deliberate: an orphan left by an earlier
# Ctrl-C would otherwise compete with this run for cores start to finish.
# Fail-safe and near-free (one `ps` scan), so it costs a clean box nothing.
sh "$(dirname -- "$0")/reap-orphaned-workers.sh" || true

# --- 1. Fast fail-fast prefix. ---
# `tsgo` (@typescript/native-preview), not `tsc`: the Go-native compiler checks
# this tree in ~2.5s against ~13s for tsc 5.9, and the same binary serves the
# editor/agent language server via `.lsp.json`, so the gate and the LSP agree on
# what a type error is. `typescript` (5.x) is still installed — see the madge
# section of metrics.sh for the ten packages that need its programmatic API.
npx tsgo -b --noEmit
# The build-side TypeScript — `vite.config.ts`, `vitest.config.ts`,
# `vite-plugins/` and the advisory checks under `scripts/checks/` — is a second
# project because it runs in Node, and `tsconfig.json` is deliberately
# browser-shaped (`"types": []`, DOM lib). It is NOT optional: the file that
# renders every help page and static entry went unchecked while it sat outside
# `include`, and the first pass over it found a dead `output.validate` (a rollup
# option rolldown neither declares nor reads) and a `defineConfig` overload
# failure. Same strictness, different runtime.
npx tsgo --noEmit -p tsconfig.node.json

# Biome checks lint rules AND formatting AND import order in one read-only pass
# (the `check`/`ci` form — not `lint`, which misses formatting; not
# `format --check`, which misses import sorting). `npm run check` stays the fixer.
#
# Scope depends on role. A commit can only make a file unformatted by touching
# it, so the automatic per-commit hook (which sets GATE_BIOME_STAGED=1) checks
# only the staged files — no redundant re-scan of an already-clean tree.
# CI and a manual `npm run gate` leave the toggle unset and check the WHOLE tree:
# that is the backstop for a --no-verify bypass and the thing that forces a
# tree-wide reformat when biome itself is upgraded. Do not scope those down.
if [ "${GATE_BIOME_STAGED:-}" = "1" ]; then
  npx biome check --staged --no-errors-on-unmatched
else
  npx biome ci .
fi

# The local-feedback corpus still APPLIES — not its result. ~0.2s, no tests run.
#
# `scripts/feedback-probe-cases.mjs` anchors each case on a verbatim excerpt of
# engine source, which is what lets a case name a real defect instead of a
# mutation operator. It is also the corpus's one fragility: refactor a probed
# line and the anchor stops matching. The harness then measures a SMALLER corpus
# and reports success — a silent cap that reads as health — and since the full
# run is ~20 minutes and deliberately opt-in, nothing else would ever notice.
#
# What is gated is only "every anchor applies". The probe's rate is NEVER gated
# or ratcheted: a gated feedback number invites tests written against the number
# rather than against behavior, which is exactly what the repo-layout
# requirement it serves forbids. A survivor is a finding to read.
#
# If this fails, re-anchor the case on surrounding text — and take the prompt to
# decide whether it still states the defect it claims to.
node scripts/feedback-probe.mjs --verify

# --- 1b. Every word this project writes is spelled the American way. ~1s. ---
#
# `scripts/checks/spelling-table.mjs` is the convention (the `repo-layout`
# spelling requirement); this scans every tracked file outside the record and
# other people's words for any stem in it. It sits HERE, in the fast prefix and
# ahead of the documentation-only shortcut below, because the shortcut skips
# vitest — and `src/gate-scope.test.ts` forbids a test from reading `docs/` or
# `openspec/` at all, which is exactly where a British spelling would otherwise
# creep back in unchecked.
node scripts/checks/spelling.mjs

# --- 1c. The specs and every open change parse and validate. ~1s. ---
#
# This is the tool's own check, deliberately, and it replaces a hand-written one.
# A `MODIFIED` delta replaces the whole requirement at archive time, so a delta
# holding a stale copy deletes whatever it omits — that cost this project 134
# lines of the `ts-engine` hint requirement on 2026-08-15. The repo answered by
# retiring the verb and writing its own scenario-survival check; the actual cause
# was an openspec CLI nine months and fifteen releases stale, which had fixed it
# in 1.6.0 (archive refuses the loss) and 1.8.0 (validate reports it at authoring
# time). See `AGENTS.md` § "Work management".
#
# So the floor is load-bearing, not hygiene: below 1.6.0 the archiver will apply
# the loss silently, and this line would still print a cheerful pass. `npx`
# resolves the pinned devDependency, which is why the version is a fact the repo
# states rather than a property of the machine.
node scripts/checks/openspec-version.mjs
npx --no-install openspec validate --all --strict

# `nice` (weak on macOS but free insurance) is applied to BOTH heavy branches,
# so the gate yields to whatever else the developer is running rather than
# competing with it. The build is niced hardest, since vitest is the branch that
# actually blocks the commit.
if command -v nice >/dev/null 2>&1; then
  NICE="nice -n 19"
  NICE_TESTS="nice -n 10"
else
  NICE=""
  NICE_TESTS=""
fi

# --- 1d. Documentation-only commits skip the heavy branches. ---
#
# The fast prefix above costs ~28s (tsgo 5s, biome 2s, openspec 1s, probe 0s,
# and the build 20s); `vitest run` is the other eight to ten minutes, and it ran
# in full for a commit touching one markdown file.
#
# **Scoped by role, exactly as the biome step is.** Only the automatic
# per-commit hook takes this path (it sets GATE_PRECOMMIT=1); CI and a manual
# `npm run gate` always run everything, so nothing reaches `main` without the
# full gate having seen it. That is the same backstop argument as `biome ci`,
# and it is why this narrows a *commit's* cost without narrowing what protects
# the branch.
#
# **The allowlist is provable, and it is proved.** These paths are read by no
# test and are not build inputs — `openspec/` is already covered by the
# `validate --all --strict` above, and `docs/` and `AGENTS.md` are read by
# nothing at all. `src/gate-scope.test.ts` asserts that, by scanning for any
# glob or file read naming them, so the day a test starts reading `docs/` this
# path stops being safe *and says so*. `help/` is deliberately absent: it is
# both a `vite build` input and `help-coverage.test.ts`'s subject.
#
# Anything outside the list — one `src/` file, one `help/` page, one license —
# and the whole gate runs. The default is "run everything"; this is the
# exception, and it fails closed.
if [ "${GATE_PRECOMMIT:-}" = "1" ]; then
  staged=$(git diff --cached --name-only --diff-filter=ACMR)
  if [ -n "$staged" ] && ! printf '%s\n' "$staged" |
    grep -qvE '^(docs/|openspec/|AGENTS\.md$|CLAUDE\.md$|CREDITS\.md$|README\.md$|LICENSE\.md$)'; then
    echo "✓ documentation-only commit — skipping vitest and vite build."
    echo "  (CI runs the full gate on push; \`npm run gate\` runs it here.)"
    exit 0
  fi
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

$NICE_TESTS npm run test:run || vitest_rc=$?
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
