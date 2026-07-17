## 1. Gate the format check

- [x] 1.1 Replace the gate's `npm run lint` step with `npx biome ci .` in
      `scripts/gate.sh`, with a comment explaining why `ci` (lint + format +
      import-sort, read-only) rather than `lint` or `format --check`.
- [x] 1.2 Update the mirrored descriptions of the gate steps in
      `.husky/pre-commit` and `.github/workflows/ci.yml` (comment + the gate
      step's name) so they do not drift from what the gate runs.
- [x] 1.3 Update the gate-step listing in `AGENTS.md` (the "Test discipline" and
      "Git" sections).

## 2. Verify

- [x] 2.1 Confirm `npx biome ci .` is clean on the current tree (it must be —
      `6b4ff96` formatted wholesale), so the new step blocks nothing today.
- [x] 2.2 Confirm the check actually fails a badly-formatted file: mis-format a
      file, run `npm run gate`, see it rejected in the prefix, revert.
- [x] 2.3 Run the full `npm run gate` green.

## 3. Spec

- [x] 3.1 Apply the `build-pipeline` deltas (biome step widened; stale
      load-probe language corrected to match `scripts/gate.sh` since `b31cdb3`).
- [x] 3.2 `openspec validate add-gate-format-check --strict`.
