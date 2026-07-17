# Change: Gate on formatting, not just lint

## Why

The pre-commit gate runs `biome lint` and never checks formatting, so the tree
was lint-clean but had never been format-clean. The cost surfaced on 2026-07-17:
running `npm run check` to tidy a small edit reformatted ~150 unrelated files
("Checked 507 files, Fixed 152 files"), burying the real diff in ~2500 lines of
churn. `6b4ff96` formatted the tree wholesale, which fixed the symptom — but
nothing stops the drift returning, because the gate still does not enforce
formatting. One unformatted commit re-opens the gap.

## What Changes

- The gate's biome step becomes `biome ci .` (lint + format + import-sort, all
  read-only) instead of `biome lint .`, so an unformatted or unsorted file fails
  the commit in the fail-fast prefix. `npm run check` stays the writing fixer.
- Correct stale `build-pipeline` spec text: `b31cdb3` removed the gate's
  load-average probe (no test is clock-gated any more, so contention makes a
  test slower, never failed) and made the heavy checks unconditionally
  concurrent, but delta'd only `repo-layout`. The spec still mandates the probe
  and a serial-on-busy-box fallback that `scripts/gate.sh` no longer implements.

## Impact

- Affected specs: `build-pipeline` (two MODIFIED requirements)
- Affected code: `scripts/gate.sh`, `.husky/pre-commit` (comment),
  `.github/workflows/ci.yml` (comment + step name), `AGENTS.md`
- No runtime/bundle impact — dev tooling only.
