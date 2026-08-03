# Metrics snapshot — mid-round, taken as `-after` (2026-08-01)

`npm run metrics` output committed by this change, after the shared
deduction-fixpoint adoption. It was named `2026-08-01-after` at the time — "after
the round's first tranche" — which is why the change that followed it describes
itself as measured against "the `metrics/2026-08-01-after` baseline".

The round, in order:

1. `../../2026-08-01-establish-refactor-baseline/metrics/` — the zero point.
2. **this one** (`-after`).
3. `../../2026-08-01-adopt-declarative-config-helpers/metrics/`
   (`-config-helpers`).

**It cannot be regenerated, and the file shows why rather than asserting it:**
every path in `summary.md` and `cycles.txt` reads `src/native/…`, a tree
`retire-native-directory` deleted on 2026-08-02. Re-running the harness today
measures a different repository. Treat these numbers as a historical
measurement.
