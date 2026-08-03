# Metrics snapshot — the round's baseline (2026-08-01)

`npm run metrics` output taken by this change, **before** any of the refactoring
round's work landed. It is the zero point the other two snapshots are read
against; the value of any of them is the diff, not the absolute number.

The round, in order:

1. **this one** — the baseline.
2. `../../2026-08-01-adopt-shared-deduction-fixpoint/metrics/` (`-after`).
3. `../../2026-08-01-adopt-declarative-config-helpers/metrics/` (`-config-helpers`).

**It cannot be regenerated, and you can see that in the file rather than take it
on trust:** every path in `summary.md` and `cycles.txt` reads `src/native/…`, a
tree `retire-native-directory` deleted on 2026-08-02. Re-running the harness
today measures a different repository and answers a different question. Treat
these numbers as a historical measurement; if a future round wants a comparison,
it takes a fresh baseline of its own.
