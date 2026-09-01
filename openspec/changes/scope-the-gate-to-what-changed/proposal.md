# scope-the-gate-to-what-changed

## Why

A commit touching one markdown file ran all **7630 tests** and took eight to ten
minutes. Measured, the gate's other phases are trivial: tsgo over both projects
5 s, biome (staged) 2 s, `openspec validate --all --strict` 1 s, the probe-anchor
check 0 s, `vite build` 20 s. **`vitest run` is the entire cost**, and for a
documentation commit it can protect nothing, because nothing under `docs/` or
`openspec/` is a test input or a build input.

Owner-reported, after three documentation commits in one session each spent
~10 minutes in the gate.

## What Changes

- **The automatic per-commit hook skips `vitest run` and `vite build` when every
  staged path is documentation** — `docs/`, `openspec/`, `AGENTS.md`,
  `CLAUDE.md`, `CREDITS.md`, `README.md`, `LICENSE.md`. One path outside that
  list and the whole gate runs; the default is "run everything".
- **Scoped by role, with CI as the backstop**, exactly as the biome step already
  is. `npm run gate` and CI leave `GATE_PRECOMMIT` unset and run everything, and
  CI runs on every push to `main` — so this narrows what a *commit* costs
  without narrowing what protects the branch.
- **`src/gate-scope.test.ts` proves the allowlist's claim.** It scans every
  test, source and build-side module for a *read* naming a skipped root, and
  fails if one appears. It also asserts `help/` is not on the list and *is*
  read, so the first assertion is known to be meaningful rather than vacuous.

## What this deliberately does NOT do

**Per-file test selection for `src/` changes was considered and declined**, and
the reason is worth recording because it is the obvious next idea. `vitest
--changed` selects by the module import graph, and this repo's most valuable
tests are the cross-game guards that reach their subjects through
`import.meta.glob(..., "?raw")` rather than through imports — `contract-surface`,
`emittable-keys`, `hint-refusal`, `help-coverage`, `palette-source`. Whether
Vite's graph carries those edges decides whether changing one game silently
skips the guards that exist to catch exactly that, and "silently skips" is the
failure this repo punishes hardest. A safe version exists (always run every
test file containing `import.meta.glob`, plus `--changed` for the rest) but it
needs its own change and its own proof that the selection is complete.

The doc-only path needs none of that: its claim is a *static* one about paths
nothing reads, and it is asserted.

## Impact

- Affected specs: `build-pipeline` (the gate requirement gains the role scoping
  it already applies to biome).
- Affected code: `scripts/gate.sh`, `.husky/pre-commit`, `src/gate-scope.test.ts`
  (new).
- **No check is dropped from `main`.** CI runs the full gate on every push.
