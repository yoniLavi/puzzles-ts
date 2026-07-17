## 1. Scope the check

- [x] 1.1 In `scripts/gate.sh`, branch the biome step on `GATE_BIOME_STAGED`:
      staged → `npx biome check --staged --no-errors-on-unmatched`; unset →
      `npx biome ci .`. Comment the split (hook vs backstop).
- [x] 1.2 In `.husky/pre-commit`, set `GATE_BIOME_STAGED=1` for the hook run.
- [x] 1.3 Update the gate-step description in `AGENTS.md` (the "Git" section) to
      note the per-commit hook checks staged files while CI/manual gate check the
      whole tree.

## 2. Verify

- [x] 2.1 Stage a mis-formatted TS file; run the hook path
      (`GATE_BIOME_STAGED=1`) and see it rejected in the prefix. An *unstaged*
      mis-format is ignored by the hook path.
- [x] 2.2 Confirm the check is read-only (the staged file is not rewritten).
- [x] 2.3 Confirm the same mis-format is still caught whole-tree by
      `npm run gate` (backstop unchanged).
- [x] 2.4 Full `npm run gate` green on the clean tree.

## 3. Spec

- [x] 3.1 Apply the `build-pipeline` delta (per-commit hook scopes biome to
      staged files; CI/manual keep whole-tree).
- [x] 3.2 `openspec validate scope-precommit-format-to-staged --strict`.
