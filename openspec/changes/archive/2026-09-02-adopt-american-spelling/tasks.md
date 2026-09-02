# Tasks — adopt-american-spelling

Phase 0 is sequencing. Phase 1 is one mechanical sweep, verified by shape, in
one commit. Phase 2 is player-visible text (design D5), a second commit.

## 0. Sequence

- [x] 0.1 The in-flight colour work landed as `58fdb336` ("one meaning, one
      role across all 57 games"); the sweep started from a clean `git status`
      at that commit.
- [x] 0.2 Baseline: HEAD `58fdb336`; both notices hash
      `43c5b4a4304e7f9d162cda91028ea83f640cd56341744057b9aeed3f10ae55ab`;
      65 snapshot files.

## 1. The table and the tooling

- [x] 1.1 `scripts/checks/spelling-table.mjs`. Nothing under `src/` — the
      guard is a node script (design D6), so a `src/` module was never needed
      and `module-layering.test.ts` is not crossed.
- [x] 1.2 `scripts/checks/spelling-fold.mjs`: stdin → stdout.
- [x] 1.3 The sweep (scratchpad, not committed): table over code and prose;
      string literals in JS/TS untouched except identifier-shaped ones, path
      fragments and `{kw}` placeholders (design D10); archive ids and per-file
      quotations masked; `.snap` files by the one key substitution.
- [x] 1.4 `scripts/checks/spelling.mjs` — the guard, in the gate's fast prefix
      (not `src/spelling.test.ts`: design D6 records why). 964 files scanned,
      floor 900, ~1 s.
- [x] 1.5 **Proved to fail.** `colour` and `game_colours` planted in a comment
      in `src/engine/midend.ts`: reported as `midend.ts:4: colour` and
      `midend.ts:4: game_colours` (the second in a file the allowance does not
      list). Reverted. As a side effect the same run found the `CLAUDE.md`
      symlink being scanned as a second `AGENTS.md`; the guard now skips
      symlinks.

## 2. Renames (every one a `git mv`)

- [x] 2.1 `src/engine/colour/` → `src/engine/color/`, with `colors.ts`,
      `colors.test.ts`, `color-token.ts`, `color-mkhighlight.ts` and its test.
- [x] 2.2 `grid-incentre.test.ts` → `grid-incenter.test.ts`.
- [x] 2.3 `scripts/checks/color-{inventory,dark-check,collide}.test.ts`, and
      `diff.vitest.config.mts`.
- [x] 2.4 `metrics/color-inventory.md`, regenerated from the renamed test
      (`npx vitest run -c scripts/checks/diff.vitest.config.mts color-inventory`).
      Its content also caught up with `58fdb336`, which had not regenerated it.
- [x] 2.5 `licenses/`, `sgt-puzzles-LICENSE`, `puzzles-unreleased-LICENSE`;
      `about-dialog.ts`'s two `?raw` imports, its test, `README.md`,
      `CREDITS.md`, `LICENSE.md` repointed. **Hashes after equal 0.2.**
- [x] 2.6 `npm run typecheck` green (both projects).

## 3. The sweep

- [x] 3.1 713 files rewritten on the first pass (26,410 lines, insertions equal
      to deletions), 23 more once identifier-shaped literals joined. Two files
      the sweep should not have touched — the upstream C under
      `openspec/changes/add-{numgame,path}-ts-port/reference/` — were reverted
      and are excluded by the guard (`\.[ch]$`).
- [x] 3.2 The recorder's `colour` key and `colour#<index>` label are `color`.
- [x] 3.3 The flood fixture's twelve `"colours"` keys and its reader.
- [x] 3.4 `node scripts/feedback-probe.mjs --verify`: 175 cases across 18
      modules, every anchor applies. One anchor quotes a narration
      (`pencilling`) that phase 1 leaves British; put back by hand.
- [x] 3.5 `AGENTS.md` "Code conventions" gains the rule; "Git" names the new
      gate step; `docs/games/README.md` "Close out" and `.husky/pre-commit`
      likewise.
- [x] 3.6a The four scenario headings respelled after the sweep;
      `openspec validate --all --strict` green (76 items).
- [x] 3.6 Residue pass: every British word left in the swept areas sits in a
      string literal (phase 2) and is already in the table; no stem was added.
      `analyses` (plural noun) is deliberately not folded; `spectre` is a proper
      noun (the tiling).

## 4. Snapshots

- [x] 4.1 Not regenerated with `vitest -u`: the key substitution was applied
      directly to the 65 files, which makes 4.2 true by construction and leaves
      the gate's `vitest run` to prove the recorded ops still match.
- [x] 4.2 `git diff --stat -- '**/__snapshots__/*.snap'`: 65 files, 19,547
      insertions and deletions; the folded diff under `sort | uniq -u` is empty.

## 5. Proofs, then the gate

- [x] 5.1 `check-rename-shape.mjs --kind any` with the moved fragments: 259
      files changed without mentioning a moved path — all `.md`/`.ts`/`.mjs`/
      `.sh`/`.svg`/`.yml` carrying a word like `behaviour` — plus the two `.c`
      files, which were the finding (3.1).
- [x] 5.2 Whole-diff fold proof, run **before** biome: empty. After
      `biome check --write` (38 files), 174 lines differ, every one a line
      biome joined or split because an identifier got shorter.
- [x] 5.3 `openspec/specs/` fold proof: empty.
- [x] 5.4 `npx openspec validate --all --strict` green.
- [x] 5.5 `npm run gate` — run by the commit hook. The first run failed 26
      tests in 5 files, all one cause: regex literals had been folded as code
      while the messages and narrations they match were left for phase 2.
      Regex literals now sit on the string side of the seam (design D10); the
      eight affected test files were re-run green before the second attempt.

## 6. Specs

- [x] 6.1 `repo-layout` — ADDED the convention; the guard is the gate script.
- [x] 6.2 `ts-engine` — RENAMED + MODIFIED ×3.
- [x] 6.3 `grid` — RENAMED + MODIFIED.
- [x] 6.4 `pegs`, `licensing`, `ts-migration` — MODIFIED.
- [x] 6.4a `build-pipeline` — MODIFIED the gate requirement: six checks, the
      spelling guard in the fast prefix ahead of the documentation-only
      shortcut, one added scenario.
- [x] 6.5 After the archive: `openspec validate --all --strict` green and the
      guard green over `openspec/specs/` with the pending-directory exclusion
      removed.

## 7. Phase 2 — words a player reads (design D5, D10)

- [x] 7.1 Decision: American in player-facing prose, per the D5 recommendation
      and the acceptance rule — a player-visible change is committed and then
      accepted by the owner, not held (owner acceptance is 7.6).
- [x] 7.2 Answered in code (design D10): the three `kw`s are `ParamConfigItem`
      keys that only round-trip the custom-params form; `Midend.prefValues`
      and `src/store/settings.ts` persist `GamePref` kws, and params persist
      as the encoded string. Not persisted.
- [x] 7.3 `colours` (Flood, Guess) and the `{colours}` placeholders renamed in
      phase 1 (identifier-shaped); `no-of-colours` with its label in phase 2.
- [x] 7.4 Swept: 173 files, 369 line pairs — 30 help pages (54 lines), the
      string literals in `src/` and `scripts/`, six snapshot files whose keys
      are test names, and `metrics/color-inventory.md` regenerated once more
      for its title. Fold proof empty; `tsc`, the probe anchors and 42
      targeted test files (the snapshot owners, the narration guards, the
      catalog and config tests) green before the gate.
- [x] 7.5 `spelling-strings.mjs` deleted; the guard scans whole files and
      `help/` (1028 files, up from 964).
- [x] 7.6 Owner acceptance, 2026-09-02: "it's hereby accepted, so archive and
      push." Archived; the guard's exclusion for this change's directory
      deleted in the same commit (task 6.5).
