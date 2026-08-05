#!/usr/bin/env sh
# The refactoring metrics harness (`npm run metrics`).
#
# Records code-health measurements as raw tool output under metrics/<date>/.
#
# COMMIT THE SNAPSHOT UNDER YOUR OPENSPEC CHANGE, not at the repo root. It is
# evidence for one piece of work: read once, and impossible to refresh
# afterwards because it measures a tree that no longer exists. Left at the root
# it reads as a current measurement of the current tree. Top-level metrics/ is
# for live instruments only — output something still reads.
#
# Its value is the DIFF BETWEEN ROUNDS, not per-commit
# freshness — which is why it is deliberately NOT part of scripts/gate.sh or
# .husky/pre-commit. A slow whole-tree scan in a gate optimised for wall-clock
# would buy nothing; see the build-pipeline spec, "Refactoring metrics are
# measured on demand and ratcheted in the gate".
#
# What is measured, and what is deliberately not:
#
#   duplication  jscpd. Concentrated duplication is the actionable kind; the
#                headline percentage is not a target.
#   cycles       madge, CALIBRATED to runtime cycles only. A raw madge count is
#                not a runtime-cycle count on a codebase with verbatimModuleSyntax
#                — `import type` is erased and forms no runtime edge. Measured
#                2026-08-01: raw 20, runtime 1. See scripts/metrics-cycles.mjs.
#                CURRENTLY UNAVAILABLE (2026-08-05): madge cannot run under
#                TypeScript 7 — see the loud arm in the madge section below. The
#                last good reading is the 2026-08-01 one above; treat it as the
#                baseline to re-measure against, not as the current state.
#   dead code    knip. Expect a small haul; this is a maintained tree, not a
#                port with #ifdef-orphaned helpers.
#   complexity   biome's noExcessiveCognitiveComplexity (the same published Sonar
#                algorithm eslint-plugin-sonarjs implements — do not add a second
#                lint toolchain for it). NOTE: biome's counter SATURATES AT 255,
#                verified by probing a synthetic function of true complexity 300.
#                The summary therefore reports 255 as ">=255", never as a maximum.
#
# NOT measured: `any` density (it is ~0 — 22 occurrences tree-wide, nearly all
# the English word — so a type-coverage ratchet would measure nothing), and LOC
# (reported by cloc if you want it, never targeted; a change that halves a file
# into dense conditional types has made things worse and LOC will applaud).
set -e

ROOT=$(cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT"

DATE=${METRICS_DATE:-$(date +%Y-%m-%d)}
OUT="metrics/$DATE"
mkdir -p "$OUT"

echo "→ metrics into $OUT"

# --- duplication ------------------------------------------------------------
# min-tokens 60 is the level at which a clone is a shared decision rather than a
# coincidence of shape (two grid loops will always look alike). Tests, snapshots
# and fixtures are excluded: a snapshot is generated data and a fixture is
# frozen, so duplication in either is not a refactoring signal.
echo "  jscpd…"
npx jscpd src \
  --min-tokens 60 \
  --reporters json \
  --output "$OUT/jscpd" \
  --ignore '**/*.test.ts,**/__snapshots__/**,**/__fixtures__/**' \
  >"$OUT/jscpd.txt" 2>&1 || true

# --- import cycles ----------------------------------------------------------
# madge is BROKEN under TypeScript 7 and this branch is why the failure is not
# swallowed. `ts-api-utils` (reached via precinct → @typescript-eslint) reads
# `ts.TypeFlags`, which the Go port does not expose, so madge dies on load with
# `TypeError: Cannot read properties of undefined`. Its exit code cannot be the
# discriminator — `--circular` exits 1 when it *finds* cycles too — so the crash
# is detected by signature. The point of the loud arm: a `|| true` here would
# leave an empty cycles.txt, which reads exactly like "no cycles found".
echo "  madge…"
npx madge --circular --extensions ts --ts-config tsconfig.json src \
  >"$OUT/cycles-raw.txt" 2>&1 || true
if grep -qE 'Cannot read properties of undefined|^TypeError' "$OUT/cycles-raw.txt"; then
  {
    echo "cycles: UNAVAILABLE — madge crashed, it did NOT report zero cycles."
    echo "  Cause: madge reads ts.TypeFlags; TypeScript 7's Go port does not"
    echo "  expose it (node_modules/ts-api-utils). Recheck when madge and"
    echo "  ts-api-utils support TS 7, or run this target against TS 5.x."
    echo "  Until then import cycles are NOT measured — do not read the"
    echo "  absence of a cycle list as evidence there are none."
  } | tee "$OUT/cycles.txt"
else
  node scripts/metrics-cycles.mjs "$OUT/cycles-raw.txt" >"$OUT/cycles.txt" 2>&1 || true
fi

# --- dead code --------------------------------------------------------------
echo "  knip…"
npx knip --no-config-hints >"$OUT/knip.txt" 2>&1 || true

# --- cognitive complexity ---------------------------------------------------
# Threshold 15 here is the MEASURING threshold (biome's default), deliberately
# lower than the RATCHET in biome.json. The harness wants the whole distribution;
# the gate wants "no new function worse than the worst one we have".
#
# CAVEAT, learned the hard way. scripts/metrics-complexity.json sets
# `recommended: false` so only the complexity rule runs — which means every
# `biome-ignore` comment in the tree for any OTHER rule shows up in this output
# as `suppressions/unused`. It is an artefact of the measuring config, not a
# finding: measured against the ROOT config the count is 0. This cost one
# spurious "35 free deletions" line in a change proposal before anyone checked.
# metrics-summary.mjs therefore reads ONLY CognitiveComplexity diagnostics from
# this file. Never read a suppression count out of it.
echo "  complexity…"
# Measured against a SUPPRESSION-STRIPPED COPY of src, deliberately.
#
# The gate honours `biome-ignore` — that is what an accepted exception means. The
# *harness* must not: a suppressed function vanishing from the measurement is how
# a baseline records "our worst function is 145" when nineteen functions are
# worse, and how a later round reads a fall in the maximum as progress it did not
# make. The gate enforces policy; the harness measures reality. Biome has no flag
# to report through suppressions, so strip them from a throwaway copy.
# The measuring config is COPIED INTO the temp root as `biome.json` rather than
# passed with --config-path: its `files.includes` patterns resolve relative to the
# config's own directory, so pointing at it from outside the tree silently changes
# which files are scanned (776 instead of 477, tests included). Let biome discover
# it in place and the patterns mean what they say.
STRIP=$(mktemp -d)
trap 'rm -rf "$STRIP"' EXIT
cp -R src "$STRIP/src"
cp scripts/metrics-complexity.json "$STRIP/biome.json"
find "$STRIP/src" -name '*.ts' -exec \
  sed -i '' '/biome-ignore lint\/complexity\/noExcessiveCognitiveComplexity/d' {} +
(cd "$STRIP" && "$ROOT/node_modules/.bin/biome" lint \
  --max-diagnostics=none \
  --reporter=json \
  src) >"$OUT/complexity.json" 2>/dev/null || true

# jscpd's raw report embeds the full source text of every clone (~456 KB, ~90% of
# the snapshot) and a snapshot is committed once per round. Distil it to what a
# later round actually diffs against — where each clone is and how long it is.
# The source itself is in git already.
node -e '
  const fs = require("fs"), p = process.argv[1];
  if (!fs.existsSync(p)) process.exit(0);
  const r = JSON.parse(fs.readFileSync(p, "utf8"));
  const slim = (f) => ({ name: f.name, start: f.start, end: f.end });
  fs.writeFileSync(p, JSON.stringify({
    statistics: r.statistics,
    duplicates: (r.duplicates ?? []).map((d) => ({
      format: d.format, lines: d.lines, tokens: d.tokens,
      firstFile: slim(d.firstFile), secondFile: slim(d.secondFile),
    })),
  }));
' "$OUT/jscpd/jscpd-report.json"
# The console log duplicates the JSON; keep only the machine-readable form.
rm -f "$OUT/jscpd.txt"

# Same for biome's report: keep the rule's own findings (file, line, score) and
# drop the suppression noise the measuring config manufactures (see the caveat
# above) plus biome's per-diagnostic advice payloads.
node -e '
  const fs = require("fs"), p = process.argv[1];
  if (!fs.existsSync(p)) process.exit(0);
  const r = JSON.parse(fs.readFileSync(p, "utf8"));
  const keep = (r.diagnostics ?? [])
    .filter((d) => String(d.category).includes("CognitiveComplexity"))
    .map((d) => ({
      file: d.location?.path?.file ?? d.location?.path,
      line: d.location?.start?.line,
      score: Number(/complexity of (\d+)/.exec(d.message ?? "")?.[1] ?? 0),
    }));
  fs.writeFileSync(p, JSON.stringify({ diagnostics: keep }));
' "$OUT/complexity.json"

# --- summary ----------------------------------------------------------------
node scripts/metrics-summary.mjs "$OUT" >"$OUT/summary.md"
echo ""
cat "$OUT/summary.md"
