# Tasks — scope-the-gate-to-what-changed

- [x] 1.1 **Measure before designing.** tsgo 5 s, biome (staged) 2 s, openspec
      validate 1 s, probe-anchor 0 s, `vite build` 20 s — and `vitest run` the
      remaining eight to ten minutes. The fix has to be about vitest or it is
      about nothing.
- [x] 1.2 **Establish the allowlist by scanning, not by assumption.** `help/` is
      globbed by `help-coverage.test.ts` *and* rendered by `extra-pages.ts`, so
      it stays gated. `docs/`, `openspec/` and the root agent files are read by
      no test and no build input; `openspec/` is separately covered by
      `validate --all --strict` in the fast prefix, which still runs.
- [x] 2.1 `scripts/gate.sh`: skip the heavy branches when every staged path is
      documentation. Fails closed — one path outside the list runs everything.
- [x] 2.2 Gate the fast path on `GATE_PRECOMMIT=1`, set only by
      `.husky/pre-commit`, so `npm run gate` and CI are unaffected.
- [x] 3.1 `src/gate-scope.test.ts` asserts the allowlist's claim, keyed on the
      **shape of a read** rather than on the roots' names — dozens of files
      mention `docs/games/*.md` in prose and a name-keyed scan would convict
      them all.
- [x] 3.2 **Proved it fails**: added an `import.meta.glob("../docs/games/hints.md")`
      to `help-coverage.test.ts` and watched the guard name it. Restored.
- [x] 3.3 Vacuity guards: >200 modules scanned, and the read pattern is proved
      still to match. Plus the `help/` counterpart — asserting it is *not*
      skipped *and* is genuinely read, so the main assertion is known to bite.
- [x] 4.1 Proved the gate skips on a documentation-only staged set, and still
      runs everything when one source file joins it.
- [x] 4.2 Full `npm run gate` green (unset env — the whole gate, as CI runs it).
- [ ] 4.3 Owner acceptance: this changes what a commit is checked against, which
      is theirs to judge even though CI still backstops it. Then archive.
