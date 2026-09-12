## 1. Citations in source

- [x] 1.1 Measure `src/**/*.ts` the way the live requirement demands. **It came
      back the other way**: 63 distinct kebab tokens across 57 files, 53
      resolving and 9 not — `docs/`'s ratio (6 of 85), not the specs' (15 of 31).
      Comments and code were measured separately and agree (32 of 39 in comments,
      21 of 24 in test titles and error strings), so the scan reads whole files
      as it does for markdown.
- [x] 1.2 `SCANNED` extended to `src/.*\.ts`. The ledger gained the seven tokens
      source brought — a params string, a command id, two solver rungs, a custom
      element, an Ascent ladder rung, a Cube params key — and the floors rose
      from 10/40 to 40/100. **Proved red**: a planted `a-change-that-never-existed`
      in a `.ts` comment failed the guard at the right file and line; removed, it
      passes. 100 ids across 814 files, 88 resolving, 12 ledgered.
- [x] 1.3 The surviving `design D<n>` and `§<n>` tags, decided.

      **The 23 the proposal counted were not 23 citations.** Eighteen of the
      `D<n>` hits are Keen's `const D4 = "aa_a_aa_ba_5a,…"` — a desc fixture
      variable, not a tag at all, which is the wrong-key failure `AGENTS.md`
      names. The real population is fourteen, and none of them was *dead* in the
      sense of pointing nowhere; they were **ambiguous**, which is worse to read
      and invisible to any scan.

      Six `§<n>` cited `docs/porting/hint-authoring.md` and
      `docs/porting/game-port-playbook.md`, both deleted by
      `rewrite-game-dev-docs`, and each is now repointed at the heading that
      inherited it — `§2.1` → "Necessity for deductions, imperative for moves",
      `§2.5` → "Keep the narration terse", `§5.2` → "Show the evidence as an
      area", `§5.1a` → "Echo the move's shape in the hint color", `§9.1` → "The
      recorder and the soundness boundary", `§3.8c` → "A touch hold arrives as
      the right button".

      Eight bare `design D<n>` now name their change, so they ride on the scan
      widened in 1.2 rather than needing one of their own. Loopy's is the
      instructive one: `design D5` named one of two archived changes that both
      have a D5, and the port's D5 (the move model) is not the one the keyboard
      test meant. Mines' five live in test titles, so the change is named once in
      the file header — **no test title changed, no snapshot key orphaned**, and
      `mines.test.ts.snap`'s one key was checked to be a title this does not
      touch.

      One further defect fell out: `touch.test.ts` wrapped a citation across a
      line (`` `audit-input-mode-\n * parity` ``), which no backtick-keyed scan
      can see. Unwrapped.

## 2. Unused exports

- [x] 2.1 **knip cannot do this job here, and its zero was a scan of nothing.**
      At the pinned 6.31.0 with a config naming this repository's real entry
      points it reports zero unused exports, and `--trace-export initSentry` — a
      symbol imported on line 1 of `src/main.ts` — answers "No export found".
      The cause is structural: this tree writes every import with a `.ts`
      specifier and knip's resolver does not follow those, so its graph stops at
      each entry file. The workaround would be rewriting every import in the
      repository to suit the tool. The devDependency is removed, so the next
      reader does not repeat this.

      `scripts/checks/unused-exports.mjs` replaces it: 808 files, 1837 exports,
      4172 of 4183 internal specifiers resolved (the eleven are `?raw` licenses
      and `?inline` CSS/SVG), floors on all three.

      **Two blind spots cost more than the check did to write, and both were the
      same shape — a relay counted as a consumer.** An `import.meta.glob` with
      `query: "?raw"` reads a file as *text* and uses none of its exports, yet
      counting those three globs as module imports marked all of `src/engine/`
      and `src/games/` wholly used. And `export * from` is a forwarding address,
      not a use; counting it as one hid everything behind `engine/index.ts`. With
      both fixed the report went from 9 to 373 — and a deliberately planted dead
      export in `engine/draw.ts`, silent under both, was caught.

- [x] 2.2 Timed at ~2 s. **It is NOT wired into the gate**, on the measurement:
      373 findings is a wall, and the only way to gate one is a 373-entry ledger,
      which is the skip list this change exists to avoid. It ships as
      `npm run dead-exports`, standing exactly where `npm run probe` and
      `npm run metrics` stand. The findings are real — five spot-checks had zero
      references anywhere — so `retire-the-dead-exports` is scaffolded to clear
      the backlog and move this into the fast prefix, which is then one line.

## 3. Complexity

- [x] 3.1 **The proposal's distribution was measured through biome's cap.** Its
      table read "152 diagnostics, 20 sites, 14 non-test" at 50 — and 20 is
      biome's default `--max-diagnostics`, so every threshold from 15 to 100 read
      exactly 20 and the distribution looked flat. With the cap lifted: 876 at
      15, 477 at 25, 154 at 50, 71 at 75, **26 at 100**, 12 at 120, 6 at 130, 2
      at 140, 0 at 150.

      Set to **130**. There is no knee to find — the tree has a long tail — so
      the number is chosen for the size of its exception list.

      **Why not 100, which the proposal's figures would have suggested.** Its 26
      sites are not a scattered tail: every one is an `interpretMove`, a
      `redraw`, or a solver's deduction loop — the three functions a game port
      inherently carries. The proposal said "every one is in `engine/grid/` or
      `divvy.ts`"; they are spread over seventeen files, and that claim was the
      capped 20 showing through. A ceiling naming 26 instances of a known,
      inherent shape gets suppressed 26 times and then ignored.

      Tests need no exclusion at 130: all six sites are outside them.
- [x] 3.2 The six accepted at their sites with the reason each is that shape —
      Ascent's input arbitration, Bridges' and Filling's per-tile redraw diffs,
      Map's and Solo's deduction loops, Sticks' accreting-drag model. The
      `biome-ignore` directive must be the **last** comment line before the node,
      so the reason sits above it rather than inside it.
- [x] 3.3 Fixed the one `biome ci` error already standing on `main`
      (`noUselessStringRaw` in `emittable-keys.test.ts`), which the per-commit
      hook's `--staged` scope cannot see.

## 4. Close

- [x] 4.1 Run the full gate.
- [x] 4.2 Archive the change.
