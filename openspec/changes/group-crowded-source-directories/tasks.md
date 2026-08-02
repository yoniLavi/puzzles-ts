# Tasks — group-crowded-source-directories

Ordered so the part that can fail *silently* (the grid move, D2) lands after the
instrument that would notice has been fixed.

## 1. Teach the probe about nesting — before anything moves

- [x] 1.1 Make `scripts/feedback-probe.mjs`'s directory walks recursive: both the
      barrel scan and `ownTests`. Today both are a flat
      `readdirSync("src/engine")`.
      **Note:** recursion is not purely move-proofing — it newly admits the
      already-nested `tilings/`, `random/`, `combi/` and `testing/` test files
      into the candidate pool. Measured, that adds exactly two edges, both
      correct: `tilings/spectre.test.ts` becomes a local test of `grid` and
      `grid-core`, and `testing/render-scenario.test.ts` one of `border-grid`.
      The derivation gets *more* right, not merely nesting-proof.
- [x] 1.2 Add the discovered-test-file floor (D2): the run fails if it finds
      fewer engine test files than the committed floor. Record the current count
      as the floor in the same commit. **Floor 50, found 55.** Placed inside
      `--verify` rather than only the full run, so it rides in the commit gate:
      the anchor check validates that the *code* is where a case says it is and
      is silent about whether the right *tests* were found, so this is the only
      gate-time check that can notice nesting.
- [x] 1.3 Prove the floor fires — temporarily point the walk one directory too
      deep, watch it fail, revert. An instrument guard that has never fired may
      not work, which is this repository's most-repeated lesson about its own
      measurements. **Forcing the walk non-recursive gives `discovered only 46
      engine test files, floor is 50`, exit 1; reverted and green.**
- [x] 1.4 Baseline: full `npm run probe` (~15 min) on the unmoved tree. Record
      the rate; it is the number every later step is compared against.

## 2. `src/engine/colour/`

- [x] 2.1 `git mv` `colours.ts`, `palette.ts`, `palette-games.ts`,
      `colour-token.ts`, `colour-mkhighlight.ts` and their **four** test files
      into `src/engine/colour/` (there is no `colour-token.test.ts`; the
      proposal's "five" counted one that does not exist).
- [x] 2.2 Repoint importers (80 files, 178 lines), `src/engine/index.ts`'s
      re-export, and the `scripts/colour-*.test.ts` files. Also two repo-root
      string references no import sweep can see: `feedback-probe-cases.mjs`'s
      `module:` path and the `new-game-port.sh` template.
- [x] 2.3 `npm run typecheck`; run the colour tests plus `npm run diff` (the
      advisory colour inventory/collide/dark-check trio). Their output must be
      identical to before the move — that trio is what would notice a colour
      module that got left behind (D5).
      **Result: all three green, and the regenerated inventory is byte-identical
      to the pre-move baseline.** But taking the baseline is what found that
      `npm run diff` had been *failing since 2026-08-01* — see 2.3a.
- [x] 2.3a **`npm run diff` was already broken, and D5 depended on it.**
      `colour-inventory.test.ts` wrote to
      `openspec/changes/consolidate-colour-palette/inventory.md`; `openspec
      archive` renamed that directory on 2026-08-01, so the test failed `ENOENT`
      on every run — silently, because an advisory run reports rather than gates.
      Output moved to `metrics/colour-inventory.md` (where
      `metrics/mutation/report.json` already lives) and committed there as the
      live baseline; verified byte-identical to the archived copy, which is also
      what proves the colour tree had not drifted meanwhile.
      **The rule, now in the spec: a tool must not write into a change
      directory — archiving renames it, so the path has an expiry date built into
      the workflow.**
- [x] 2.3b **Two constructs the import sweep could not see, both in moved files.**
      `palette-source.test.ts`'s `import.meta.glob("../games/**/*.ts")` and
      `other-puzzles-menu.ts`'s `new URL("../assets/icons/…", import.meta.url)`.
      The `new URL` pair is loud (`asset-integrity.test.ts` asserts they
      resolve); the **glob is silent** — an unmatched glob yields `{}`, so three
      assertions would have passed over nothing. What caught it was the file's
      own `expect(sources.length).toBeGreaterThan(100)` guard. And under that sat
      a third: `path.replace("../games/", "")` is depth-keyed arithmetic, so it
      left `../abcd/render.ts` and turned the game id into `".."`. Rewritten to
      cut at `/games/` and **throw** when the match fails.

## 3. `src/engine/grid/`

- [x] 3.1 `git mv` the twelve grid modules, their tests, `__fixtures__/grid-*.json`
      and the `tilings/` subdirectory into `src/engine/grid/`; `grid.ts` becomes
      `grid/index.ts` (D4). `border-grid.ts` deliberately stays flat — it is a
      different mechanic (the tri-state edges Palisade and Separate share), not a
      member of the family.
- [x] 3.2 Repoint importers (Loopy is the heaviest consumer) and
      `scripts/feedback-probe-cases.mjs` + `scripts/stryker.config.mjs`.
      29 files, 40 lines, every one an import line. The two script files hold
      **one** grid path each plus `grid-core.ts`, not the 14/7 the proposal
      estimated. `tilings/` needed no repointing at all: it moved *with* the
      family, so `"../grid-core.ts"` from inside it still resolves.
- [x] 3.3 `npm run probe -- --verify` — the anchors quote source lines, so a pure
      move leaves them valid; a failure here means something other than a move
      happened. **All 93 apply, and the walk still finds 55 test files** — the
      floor's first real duty, and it passed by following the family down.
- [x] 3.4 **Full `npm run probe`, and compare the rate to 1.4.** Not optional for
      this change: it is the only check that would catch D2's silent shrink.
      The derived own-test set for `grid/index.ts` is the *same five files* at
      their new paths, including the nested `grid/tilings/spectre.test.ts`.

## 4. `src/puzzle/components/`

- [x] 4.1 `git mv` the nine Lit components into `src/puzzle/components/`, dropping
      the `puzzle-` filename prefix (D3). **Do not touch any
      `@customElement("puzzle-…")` tag name** or any template that uses it.
      `contexts.ts` deliberately stayed at the root: four files outside
      `components/` (three dialogs and `components/reference-panel.ts`) consume
      the context token, so it is runtime vocabulary, not a component.
- [x] 4.2 Repoint importers, including `src/screens/puzzle-screen.ts` and the
      side-effect registration imports — a Lit component that is never imported
      registers no element, and that failure appears only at runtime.
      **Verified by shape: all 61 changed lines are import/export lines.**
      `src/puzzle/README.md` rewritten around the two roles (it also still
      pointed at `src/native/engine/`).
- [x] 4.3 `npm run gate`, then `npm run dev` and load a puzzle page: confirm the
      board, the key bar, the history bar and the type menu all render. Tier-3
      component tests cover the command paths but not "was this element ever
      registered".
      Chrome, 0 console errors: **all twelve `@customElement` tags resolve**
      through `customElements.get`, Galaxies renders its board + type menu +
      history bar, Keen renders its 1–6 key bar, and the Other-puzzles menu shows
      **57 of 57 thumbnails loaded** — that last one being the direct check on
      the `new URL(…, import.meta.url)` pair from 2.3b, which the type-checker
      cannot see and the suite would only have caught via `asset-integrity`'s
      static scan.

## 5. Specs and close-out

- [ ] 5.1 `repo-layout` — MODIFIED "Source tree under `src/` groups files by UI
      role" (the two engine subdirectories, the `src/puzzle/` split; written
      against the post-`retire-native-directory` text) and MODIFIED "A shared
      module's tests give feedback where the code lives" (the derivation is
      recursive and floor-guarded).
- [x] 5.1a **Three further specs name a moved path and needed deltas** the
      scaffold had not anticipated: `grid` ("The engine SHALL provide
      `src/engine/grid.ts`"), `pegs` and `ts-engine` (two requirements naming
      `src/engine/colour-mkhighlight.ts`). Path corrections only — no guarantee
      changes — but a spec naming a file that does not exist is exactly the
      false signal this repo treats as a defect.
- [ ] 5.2 Update `docs/porting/game-port-playbook.md` and
      `docs/porting/hint-authoring.md` where they point at moved files.
      Swept: `hint-authoring.md` names no moved path (its "grid"/"colour"
      mentions are all about the concepts). The live pointers are in
      `game-port-playbook.md`, `docs/tilings/README.md` and
      `docs/test-strength.md`; also `AGENTS.md`'s Source-tree list.
      Verified by a checker rather than by enumeration: **all 365 relative
      links across every tracked `.md` resolve**, which is what found two the
      hand-list had missed (`colours.test.ts`, `palette-source.test.ts`) and one
      pre-existing (`README.md`'s `[LICENSE](./LICENSE)`, the file being
      `LICENSE.md`). Archived changes' broken links are left alone — they are the
      record. The playbook also gained a short paragraph stating the flat-unless-
      it-is-one-of-the-two-families rule, since it is the followable form of what
      the spec now requires.
- [ ] 5.3 **Sweep the pending changes under `openspec/changes/`** (not
      `archive/`) for paths this change invalidates — `engine/grid*.ts`,
      `engine/colour*.ts`, `engine/palette*.ts`, `src/puzzle/puzzle-*.ts`. A
      stale path in an unstarted change is a step someone will execute verbatim,
      which is worse than a stale path in a spec or an archive.
      Found: `refile-misplaced-artefacts` (2× `engine/tilings/`) and
      `refine-slide-appearance` (2× `engine/colours.ts` / `palette.ts`). No
      pending change names a `src/puzzle/puzzle-*.ts`.
- [x] 5.4 `openspec validate group-crowded-source-directories --strict`, and
      re-validate every pending change touched by 5.3. All three valid.
- [ ] 5.5 Owner acceptance, then archive.

## 6. Found while implementing, not scoped here

- [x] 6.1 **`retire-native-directory` left stale `src/native/…` mentions**, and
      they split into two kinds that want different treatment.
      **(a) Five live pointers** — `catalog-data.ts`, `augmentation.test.ts`,
      `retry-limit.ts`, `midend.test.ts`, `utils/color.ts` — each naming a
      directory that does not exist as if a reader could go look. Fixed here, in
      a **separate commit** so this change's diff stays readable.
      (`palette-source.test.ts` had one too and is fixed above, since the file
      moved anyway. `metrics-summary.mjs`'s mention is *deliberately* historical
      — it explains why the path arithmetic changed — and is left alone.)
- [ ] 6.2 **Handoff: the 30 per-game differential "regenerate" headers.** Each
      reads *"Regenerate the frozen fixture while `puzzles/<game>.c` still
      exists:"* followed by `cmake -B build/native -S puzzles
      -DUSE_TS_RANDOM=0`, a `make <game>-trace`, and an output path under
      `src/native/games/…`. **Rewriting the path would be the wrong fix**: it is
      not one stale segment in a live recipe, it is a dead recipe — `puzzles/`,
      `build/native/`, the CMake tree and the `USE_TS_*` flags all went with
      `retire-c-engine`, and the fixtures are one-way now by decision. They
      should be re-headed as *how this fixture was captured, and that it cannot
      be re-run*, which is a content decision across 30 files and wants its own
      scoping — not a line in a directory-grouping refactor.
