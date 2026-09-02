# Tasks — adopt-american-spelling

Phase 0 is sequencing. Phase 1 is one mechanical sweep, verified by shape, in
one commit. Phase 2 is player-visible text and waits on the owner (design D5).

## 0. Sequence

- [ ] 0.1 Wait for the in-flight work on `src/engine/colour/`,
      `src/games/{loopy,palisade,separate}`, `src/puzzle/augmentation.ts` and
      `docs/games/rendering.md` to be committed. Start from a clean
      `git status`; the sweep is one commit (design D8).
- [ ] 0.2 Record the baseline the shape checks compare against:
      `git rev-parse HEAD`, `sha256sum licences/*` (the two notices' bytes),
      `git ls-files '**/__snapshots__/*.snap' | wc -l` (must be 65 — a
      different number means a snapshot was added or dropped since this was
      scoped, and the D4 file-count check needs the new figure).

## 1. The table and the tooling

- [ ] 1.1 Write the stem table from design D3 as one importable module, and
      settle its home so that a gate test under `src/` and a node script under
      `scripts/checks/` both read it without crossing `module-layering.test.ts`
      (a `src/`-root `.ts` module imported by both, with the script run via the
      same loader the other `scripts/` node tooling uses, is the default;
      record what was chosen here).
- [ ] 1.2 `scripts/checks/spelling-fold.mjs`: stdin → stdout, applying the
      table case-preservingly. This is the fold every shape proof below uses.
- [ ] 1.3 The sweep itself: a script (kept in the scratchpad, not committed —
      it runs once) that applies the table to identifiers and prose in the
      swept areas of design D2, **skipping** the quotation allowances of
      design D6 and the excluded paths. A whole-word rule is wrong here
      (`ncolours`, `bgcolour`, `colourToOKLCH`); a substring rule is right,
      which is why the table must not contain a stem that is also a fragment
      of an American word.
- [ ] 1.4 `src/spelling.test.ts` (design D6): scans the swept areas for any
      table stem, reports file and line for every hit not covered by a
      quotation allowance, asserts the scanned-file count is above a floor.
- [ ] 1.5 **Prove the guard fails.** Plant `colour` in a comment in
      `src/engine/midend.ts`, run `npx vitest run src/spelling.test.ts`, see
      red, revert. Then plant `game_colours` in a file the allowance does not
      name, see red, revert — an allowance must be per-file or it covers
      everything.

## 2. Renames (every one a `git mv`)

- [ ] 2.1 `src/engine/colour/` → `src/engine/color/`; inside it
      `colours.ts` → `colors.ts`, `colours.test.ts`, `colour-token.ts` →
      `color-token.ts`, `colour-mkhighlight.ts` → `color-mkhighlight.ts` and
      its test. `palette*.ts` keep their names.
- [ ] 2.2 `src/engine/grid/grid-incentre.test.ts` → `grid-incenter.test.ts`.
- [ ] 2.3 `scripts/checks/colour-{inventory,dark-check,collide}.test.ts` →
      `color-…`, and their three entries in
      `scripts/checks/diff.vitest.config.mts`.
- [ ] 2.4 `metrics/colour-inventory.md` → `metrics/color-inventory.md`, by
      regenerating it from the renamed test rather than editing it — it is
      generated output, and its header says so.
- [ ] 2.5 `licences/` → `licenses/`; `sgt-puzzles-LICENCE` →
      `sgt-puzzles-LICENSE`, `puzzles-unreleased-LICENCE` →
      `puzzles-unreleased-LICENSE`; `licences/README.md` moves with them and
      its prose is swept. Repoint the two `?raw` imports in
      `src/dialogs/about-dialog.ts`, the assertions in `about-dialog.test.ts`,
      and the links in `README.md`, `CREDITS.md`, `LICENSE.md`.
      **`sha256sum licenses/*LICENSE` must equal the 0.2 figures** — the
      contents are someone else's words.
- [ ] 2.6 Every `import` that named a moved file resolves: `npm run typecheck`
      green.

## 3. The sweep

- [ ] 3.1 Run 1.3 over `src/` (all file types), `scripts/`, `vite-plugins/`,
      `templates/`, `docs/`, `AGENTS.md`, `README.md`, `CREDITS.md`,
      `LICENSE.md`, `openspec/specs/`, and the pending
      `openspec/changes/*/` directories **except** this change's own
      directory and `archive/` (`repo-layout`: a path move sweeps the pending
      changes that name it — `claim-project-authorship` names `licences/`).
- [ ] 3.2 The render recorder: `colour` → `color` on the op record in
      `src/engine/testing/recording-drawing.ts` and every test that reads
      `op.colour` (the sweep does this; this task is the reminder that the key
      is load-bearing for D4).
- [ ] 3.3 The flood fixture: rename the `"colours"` key (twelve occurrences)
      in `src/games/flood/__fixtures__/flood-c-reference.json` and its reader;
      confirm by diff that only those twelve lines changed in the file.
- [ ] 3.4 Re-anchor the 11 probe cases in `scripts/feedback-probe-cases.mjs`
      whose quoted lines carry a British stem (they are the anchors' *text*,
      so the sweep respells them correctly by construction — this task is to
      run `npm run probe -- --verify` and confirm all 193 still locate).
- [ ] 3.5 `AGENTS.md` "Code conventions" gains the rule in the present tense:
      *American English spelling in identifiers, paths and prose; the archive,
      the postmortems and quoted upstream symbols keep theirs;
      `src/spelling.test.ts` is the guard.* Its own text is swept
      (`engine/colour/`, `licences/`, `colour-token.ts`, and the prose).
- [ ] 3.6a Immediately after 3.1 has respelled `openspec/specs/`, respell the
      four scenario headings in this change's own deltas that were left
      British on purpose — `specs/pegs/spec.md` ("Pegs colours on a
      near-white host") and the three "incentre" scenarios in
      `specs/grid/spec.md` — and re-run `npx openspec validate
      adopt-american-spelling --strict`. They are British today because the
      validator matches scenario headings against the live spec verbatim,
      for RENAMED requirements too (design D7).
- [ ] 3.6 The residue pass (design D3): scan the swept areas for `our\b`,
      `ise[sd]?\b`, `isation`, `yse[sd]?\b`, `tre\b` stems the table did not
      name, read the list, and add every British one **to the table** (then
      re-run 3.1), never fix it by hand.

## 4. Snapshots

- [ ] 4.1 `npx vitest run -u` over the files that own the 65 snapshot files.
- [ ] 4.2 Run the D4 shape proof: every changed snapshot line folds to its
      old line under the one key substitution, and exactly 65 files changed.
      A line that does not fold is a render difference and is investigated
      before anything else in this change proceeds.

## 5. Proofs, then the gate

- [ ] 5.1 `node scripts/check-rename-shape.mjs --kind any --moved engine/colour/
      --moved engine/color/ --moved licences/ --moved licenses/
      --moved incentre --moved colour-inventory` — the out-of-scope report
      must be empty.
- [ ] 5.2 The whole-diff shape proof, source and docs: for every changed
      non-snapshot, non-renamed-only file, removed lines folded through 1.2
      equal added lines folded through 1.2 (`sort | uniq -u` prints nothing).
      Read every exception; the expected exceptions are exactly the deltas'
      subjects, `AGENTS.md`'s new bullet, the new test, and the fold script.
- [ ] 5.3 The `openspec/specs/` shape proof from design D7, separately, so a
      spec change that is not a respelling is seen on its own.
- [ ] 5.4 `npx openspec validate --all --strict` green with the deltas below.
- [ ] 5.5 `npm run gate` — tsc, biome, the probe anchor check, vitest (which
      now includes `src/spelling.test.ts`), `vite build` (which is what
      proves the two `?raw` imports resolve).

## 6. Specs

- [ ] 6.1 `repo-layout` — ADDED "Source, documentation and specs use American
      English spelling" (the convention, the exclusions, the guard).
- [ ] 6.2 `ts-engine` — RENAMED + MODIFIED the colour-mkhighlight helper
      requirement; MODIFIED the full mkhighlight helper and the type-vocabulary
      requirements.
- [ ] 6.3 `grid` — RENAMED + MODIFIED "Face incentre for label placement".
- [ ] 6.4 `pegs`, `licensing`, `ts-migration` — MODIFIED the requirement in
      each that names a moved path.
- [ ] 6.5 Confirm, after the archive, that the six modified requirements read
      correctly in `openspec/specs/` and that no spec still says `colour`
      outside a quotation: `npx vitest run src/spelling.test.ts`.

## 7. Phase 2 — words a player reads (waits on the owner; design D5)

- [ ] 7.1 Owner decision recorded here: American in player-facing prose — yes /
      no. Recommendation: yes.
- [ ] 7.2 Establish in code whether any config `kw` (`"colours"` in
      `src/games/flood/index.ts` and `src/games/guess/index.ts`,
      `"no-of-colours"` in `src/games/samegame/index.ts`) reaches IndexedDB, a
      URL or a shared game ID. `src/store/db.ts` persists `EncodedParams`,
      which suggests not; the sentence in `src/engine/game.ts` about presets
      says otherwise for preset keywords. Read both consumers and state the
      answer here with file pointers.
- [ ] 7.3 If a `kw` is persisted: keep the old key, or migrate it, per the
      owner — the label changes regardless. If none is: rename the three
      `kw`s and the `{colours}` / `{no-of-colours}` interpolations in
      `src/puzzle/augmentation.ts` together.
- [ ] 7.4 Sweep `help/` (28 pages), `src/puzzle/catalog-data.ts` objectives
      and descriptions, the config-item `name` labels, and the 69 string
      literals in `src/` that carry a British word (validation messages,
      preset labels, hint narrations). `src/help-coverage.test.ts` and the
      hint narration tests catch a broken page or sentence.
- [ ] 7.5 Add `help/` and the string literals to the guard's swept areas, so
      the two phases end with one rule and one scan.
- [ ] 7.6 Owner acceptance: read a help page, a catalog card, the Samegame
      custom dialog and a Map hint in the running app.
