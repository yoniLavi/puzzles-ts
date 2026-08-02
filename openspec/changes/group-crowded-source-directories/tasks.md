# Tasks — group-crowded-source-directories

Ordered so the part that can fail *silently* (the grid move, D2) lands after the
instrument that would notice has been fixed.

## 1. Teach the probe about nesting — before anything moves

- [ ] 1.1 Make `scripts/feedback-probe.mjs`'s directory walks recursive: both the
      barrel scan and `ownTests`. Today both are a flat
      `readdirSync("src/engine")`.
- [ ] 1.2 Add the discovered-test-file floor (D2): the run fails if it finds
      fewer engine test files than the committed floor. Record the current count
      as the floor in the same commit.
- [ ] 1.3 Prove the floor fires — temporarily point the walk one directory too
      deep, watch it fail, revert. An instrument guard that has never fired may
      not work, which is this repository's most-repeated lesson about its own
      measurements.
- [ ] 1.4 Baseline: full `npm run probe` (~15 min) on the unmoved tree. Record
      the rate; it is the number every later step is compared against.

## 2. `src/engine/colour/`

- [ ] 2.1 `git mv` `colours.ts`, `palette.ts`, `palette-games.ts`,
      `colour-token.ts`, `colour-mkhighlight.ts` and their five test files into
      `src/engine/colour/`.
- [ ] 2.2 Repoint importers, `src/engine/index.ts`'s re-exports, and the four
      `scripts/colour-*.test.ts` files (14 path references).
- [ ] 2.3 `npm run typecheck`; run the colour tests plus `npm run diff` (the
      advisory colour inventory/collide/dark-check trio). Their output must be
      identical to before the move — that trio is what would notice a colour
      module that got left behind (D5).

## 3. `src/engine/grid/`

- [ ] 3.1 `git mv` the twelve grid modules, their tests, `__fixtures__/grid-*.json`
      and the `tilings/` subdirectory into `src/engine/grid/`; `grid.ts` becomes
      `grid/index.ts` (D4).
- [ ] 3.2 Repoint importers (Loopy is the heaviest consumer) and
      `scripts/feedback-probe-cases.mjs` (14 references) +
      `scripts/stryker.config.mjs` (7).
- [ ] 3.3 `npm run probe -- --verify` — the anchors quote source lines, so a pure
      move leaves them valid; a failure here means something other than a move
      happened.
- [ ] 3.4 **Full `npm run probe`, and compare the rate to 1.4.** Not optional for
      this change: it is the only check that would catch D2's silent shrink.

## 4. `src/puzzle/components/`

- [ ] 4.1 `git mv` the nine Lit components into `src/puzzle/components/`, dropping
      the `puzzle-` filename prefix (D3). **Do not touch any
      `@customElement("puzzle-…")` tag name** or any template that uses it.
- [ ] 4.2 Repoint importers, including `src/screens/puzzle-screen.ts` and the
      side-effect registration imports — a Lit component that is never imported
      registers no element, and that failure appears only at runtime.
- [ ] 4.3 `npm run gate`, then `npm run dev` and load a puzzle page: confirm the
      board, the key bar, the history bar and the type menu all render. Tier-3
      component tests cover the command paths but not "was this element ever
      registered".

## 5. Specs and close-out

- [ ] 5.1 `repo-layout` — MODIFIED "Source tree under `src/` groups files by UI
      role" (the two engine subdirectories, the `src/puzzle/` split; written
      against the post-`retire-native-directory` text) and MODIFIED "A shared
      module's tests give feedback where the code lives" (the derivation is
      recursive and floor-guarded).
- [ ] 5.2 Update `docs/porting/game-port-playbook.md` and
      `docs/porting/hint-authoring.md` where they point at moved files.
- [ ] 5.3 **Sweep the pending changes under `openspec/changes/`** (not
      `archive/`) for paths this change invalidates — `engine/grid*.ts`,
      `engine/colour*.ts`, `engine/palette*.ts`, `src/puzzle/puzzle-*.ts`. A
      stale path in an unstarted change is a step someone will execute verbatim,
      which is worse than a stale path in a spec or an archive.
- [ ] 5.4 `openspec validate group-crowded-source-directories --strict`, and
      re-validate every pending change touched by 5.3.
- [ ] 5.5 Owner acceptance, then archive.
