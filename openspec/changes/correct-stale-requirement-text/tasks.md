# Correct stale requirement text

## 1. Re-take the census

- [ ] 1.1 Re-run each instrument rather than trusting the proposal's list, and
      record the counts here as the vacuity check for section 6:
      - **Tier words**: for every spec whose `src/games/<id>/` calls
        `tierNames(n[, { search: true }])`, every line naming a tier word
        (`Easy Normal Tricky Hard Extreme Unreasonable`, plus retired words such
        as `Medium Basic Trivial Intermediate Advanced Recursive`, capitalized or
        as a quoted lowercase value) that the call does not produce.
      - **Paths**: every backticked token under a repo root (`src/`, `scripts/`,
        `docs/`, `help/`, …) or a bare file name, checked against `git ls-files`.
      - **The C engine**: `C/WASM`, `WASM path`, `wasm artifact`, `unported`,
        `non-ported`, `puzzles/<name>.c`.
      - **Deleted declarations**: `needsRightButton`, `REQUIRE_RBUTTON`.

      Key the tier instrument on the *call*, not on its argument: the
      2026-09-12 census matched `tierNames(<digit>` and so missed Magnets, whose
      call is `tierNames(DIFF_COUNT)`, and Bridges, whose list is
      `DIFFICULTY_NAMES` rather than `DIFF_NAMES`.
- [ ] 1.2 Classify every hit by reading its line: stale present-tense claim, or
      deliberate history ("was", "retired by", "rather than upstream's"). Only the
      first kind is in scope. The 2026-09-12 path census was mostly history — of
      56 hits, about four were stale.

## 2. Tier vocabulary

- [ ] 2.1 For each game spec in the census, restate the params, presets, solver
      ladder and scenarios in the words its `DIFF_NAMES` produces. Name tiers the
      way the code does — by the conventional word, never by upstream's.
- [ ] 2.2 Light Up's "current Hard tier … chosen by the owner" passage: read the
      requirement's history (`git log -S`) and state the resolved tier, which the
      code calls `Unreasonable`.
- [ ] 2.3 Salad's `DIFF_EASY` / `DIFF_HARD` doc comments in `state.ts`.

## 3. Deleted declarations

- [x] 3.1 Drop `needsRightButton = true` from the first requirement of `bridges`,
      `dominosa`, `magnets` and `tents` (and any other the census finds).
      Done in this change's first deltas, which also rename those four
      requirements' tiers; their other requirements still need 2.1. The census
      found no fifth spec.

## 4. The C/WASM hybrid

- [ ] 4.1 `flip`, `galaxies`: replace "… is served by the native TS engine" with
      what is still true (registered in the engine registry) and retire the
      C/WASM scenario by `REMOVED` + `ADDED`.
- [ ] 4.2 `ts-engine`: for each requirement specifying an unported game's
      capability value, decide whether the clause has any remaining meaning (a
      game that does not implement the hook) and restate it that way, or retire
      the scenario. Same for "A TS-ported game stays in the catalog without a wasm
      artifact", whose premise is gone.
- [ ] 4.3 `quick-save`, `ts-migration`: the remaining present-tense mentions.

## 5. Contradicted requirements

- [ ] 5.1 `netslide`: retire the "solution not known" clause and scenario in
      favor of the requirement the code follows.
- [ ] 5.2 `palisade`: "shaded" → "outlined" for referenced cells and cited
      regions, confirmed against `render.ts`.
- [ ] 5.3 `repo-layout`: rewrite the Cloudflare requirement to match the deploy
      `AGENTS.md` § "Build commands" describes, or retire it if `build-pipeline`
      already governs the deploy.
- [ ] 5.4 `random` surface names; `grid`'s `grid.ts`; `ts-engine`'s
      `puzzle-view.ts`; `repo-layout`'s component list; `undead`'s key count.
- [ ] 5.5 `help/games/bridges.md`: say bridges may be doubled, or more on a
      custom board.

## 6. Verify and conclude

- [ ] 6.1 Before writing each `MODIFIED` block, grep the live spec for the
      sentence and confirm which requirement holds it (`AGENTS.md` § "Work
      management").
- [ ] 6.2 Re-run section 1's instruments: zero stale hits, and the history hits
      unchanged in number.
- [ ] 6.3 `openspec validate --all --strict`, full gate, archive.
