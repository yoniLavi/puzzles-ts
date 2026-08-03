# Metrics snapshot — the round's last measurement (2026-08-01)

`npm run metrics` output taken by this change, after adopting the shared
params/prefs helpers. This is the final reading of the refactoring round; the
change's own `tasks.md` §4 reads it against the previous one.

The round, in order:

1. `../../2026-08-01-establish-refactor-baseline/metrics/` — the zero point.
2. `../../2026-08-01-adopt-shared-deduction-fixpoint/metrics/` (`-after`).
3. **this one** (`-config-helpers`).

**It cannot be regenerated, and the file shows why rather than asserting it:**
every path in `summary.md` and `cycles.txt` reads `src/native/…`, a tree
`retire-native-directory` deleted on 2026-08-02. Re-running the harness today
measures a different repository. Treat these numbers as a historical
measurement.
