# close-bulk-edit-blind-spots

## Why

`retire-native-directory`'s postmortem ended with two recommendations that were
written down and not done. Two subsequent changes in the same wave supplied the
evidence they were waiting for.

**The checker.** That change's bulk import-rewriter corrupted `formatAsText`
output in a dozen games and `params.ts`'s `formatG` — and `tsc`, biome, the full
suite and `vite build` were all green, because the corrupted values are data, not
types. The postmortem recommended a `check-rename-shape` script and noted it
cannot be a gate step, since only the author knows a diff was *meant* to be a
pure rename. It stayed unwritten because the case for it was speculative.

It is not speculative now. `group-crowded-source-directories` moved ~50 files and
needed **two** ad-hoc checks, written in a scratch directory and thrown away, and
each caught something the other could not:

- **Shape** (*is every changed line the kind of line I meant to change?*) caught
  a rewriter editing `import "../test-setup/icons.ts";` inside that file's own
  doc comment, where the line is prose written from a consumer's perspective.
- **Scope** (*did any file change that has nothing to do with the move?*) caught
  seven files whose extensionless specifiers had silently gained `.ts`. Shape is
  structurally blind to those: they are perfectly well-formed import lines.

Writing the same tool twice and deleting it twice is the argument.

**The `toContain` note**, which turned out to be a live defect rather than a
documentation gap. The postmortem observed that `abcd`'s test was blind to the
`"."` → `"./"` corruption, and guessed why. Checking it: `abcd.test.ts:416` is
`expect(text).toContain(".")`, and **a string containing `"./"` contains `"."`**.
Planting the same edit again (2026-08-03) renders every cell of the board wrong
and leaves all 28 tests in the file green.

## What Changes

- **`scripts/check-rename-shape.mjs`** — the two checks, generalised from the
  ones actually used. `--kind import|comment|any` for the shape question,
  repeated `--moved <fragment>` for the scope question, `--staged` for the index.
  On-demand, not a gate step, for the reason the postmortem gave. It reports how
  many lines it inspected as well as how many offended, because both checks
  report *offenders* and a diff parser that parsed nothing would otherwise return
  a clean bill of health — the `module-layering.test.ts` failure exactly.
- **`abcd.test.ts`'s four `toContain` assertions become one
  `toMatchInlineSnapshot()`** of the whole rendered board. Verified both ways:
  green as it stands, and failing on the planted `"./"`.
- **`docs/test-strength.md`** gains the trap, with the asymmetry that decides
  which sites are worth changing: `not.toContain("x")` is *strengthened* by the
  superstring property, so only the **positive** single-character form is blind.

Explicitly **not** in this change:

- **The other ~14 positive single-character `toContain` sites.** They are in ten
  games' text-format and hint tests, and each would need its own expected value
  worked out. Rewriting them from a grep — without a demonstrated defect at any
  one of them, as there was at `abcd` — is blind churn across ten games. The
  documented trap is what stops the next one being written; these are listed in
  `tasks.md` as a handoff.
- **Making the checker a gate step.** Unchanged from the postmortem's reasoning:
  a commit that deliberately changes behaviour alongside a move would fail it for
  being what it says it is.

## Impact

- **Affected specs**: `repo-layout` — the assertion-strength requirement that
  already carries the "two sides derive from the same value" rule gains the
  single-character-needle sibling; and the bulk-edit requirement gains the tool.
- **Affected code**: `scripts/check-rename-shape.mjs` (new),
  `src/games/abcd/abcd.test.ts`, `docs/test-strength.md`.
- **Risk**: very low. The script is additive and runs nowhere automatically; the
  one test change was verified to fail on the defect it was blind to.
