# Tasks — refile-misplaced-artefacts

Independent of the other two reorg changes; can land before, between or after —
with one ordering note in 1.2 if `retire-native-directory` has not landed yet.

## 1. `docs/tilings/` → `docs/upstream/tilings/`

- [ ] 1.1 `git mv docs/tilings docs/upstream/tilings`, README included. **Do not
      edit a word of the diagrams or the pages** — they are upstream's, and the
      whole point of the move is that the directory no longer tells the next
      session to keep them current.
- [ ] 1.2 Add `docs/upstream/README.md` stating the rule this move establishes:
      a directory named `upstream/` holds verbatim third-party material, points
      at `licences/sgt-puzzles-LICENCE`, and is read-only. Mirror the wording of
      `help/upstream/README.md` so the two read as one convention.
- [ ] 1.3 Fix the orphan: add a pointer comment in `src/engine/tilings/hat.ts`
      and `spectre.ts` to the diagrams that explain their kitemap/metamap tables.
      Today the material is reachable from exactly one bullet in `AGENTS.md` and
      from nowhere in the code. (Path note: `src/native/engine/tilings/` if
      `retire-native-directory` has not landed.)
- [ ] 1.4 Open `hats.html` and `hatmaps.html` in a browser and confirm every
      `<img>` still resolves. They reference the 25 SVGs relatively; a move that
      breaks them fails silently, because nothing in the gate opens an HTML file
      that is not a build input.
- [ ] 1.5 Update the `docs/tilings/` bullet in `AGENTS.md`.

## 2. Relocate the finished round's metrics snapshots

- [ ] 2.1 `git mv metrics/2026-08-01/`, `metrics/2026-08-01-config-helpers/` and
      `metrics/2026-08-01-after/` under the archived changes that produced them.
      Keep each `summary.md` with its own raw output — a summary separated from
      the numbers it summarises stops being checkable.
- [ ] 2.2 Add a one-paragraph README beside them recording what the round was and
      that the snapshots **cannot be regenerated** (they measure a tree that no
      longer exists), so a later reader does not try.
- [ ] 2.3 Repoint `docs/porting/game-port-playbook.md`'s reference to the
      committed `metrics/<date>/` snapshot.
- [ ] 2.4 Confirm `metrics/` now holds only `mutation/report.json`, and that
      `docs/test-strength.md`'s reference to it still resolves.

## 3. `scripts/checks/`

- [ ] 3.1 `git mv scripts/colour-{inventory,collide,dark-check}.test.ts` and
      `scripts/diff.vitest.config.mts` into `scripts/checks/`.
- [ ] 3.2 Update the config's `include` globs (they name `scripts/…` paths), the
      `diff` script in `package.json`, and the usage comment at the top of the
      config.
- [ ] 3.3 **Run `npm run diff`.** These files are outside the gate, so nothing
      else would notice a broken path — which is exactly why the move has to be
      exercised rather than assumed.
- [ ] 3.4 Confirm the main `vitest.config.ts` still cannot pick them up: its
      `include` is `src/**/*.test.ts`, so `scripts/checks/` stays out of the gate
      by construction, not by luck.

## 4. Stryker's sandbox

- [ ] 4.1 Set `tempDirName` in `scripts/stryker.config.mjs` to a path outside the
      project tree.
- [ ] 4.2 Delete the five stale `.stryker-tmp/sandbox-*` copies (192 MB), and
      remove the now-dead `/.stryker-tmp/` entry from `.gitignore` — an ignore
      rule for a directory the tool no longer writes is the same false signal
      this change is about.
- [ ] 4.3 Run `npm run mutation` far enough to confirm it creates its sandbox in
      the new location and the run starts, then stop it. A full mutation run is
      ~400 minutes and is not needed to verify a path.

## 5. Specs and close-out

- [ ] 5.1 `repo-layout` — MODIFIED "Developer guides live under docs/ and link to
      specs": the authorship boundary, and what `docs/` is *not*.
- [ ] 5.2 `build-pipeline` — MODIFIED "Refactoring metrics are measured on demand
      and ratcheted in the gate": a round's snapshot is committed under the
      change that produced it; `metrics/` holds only live instruments.
- [ ] 5.3 `repo-layout` — the root entry-point-directory list loses `metrics/`.
      (Sequencing note: if `retire-native-directory` is still unarchived, add
      this to its "Repo root holds product-level config only" delta instead of
      writing a competing one.)
- [ ] 5.4 `openspec validate refile-misplaced-artefacts --strict`.
- [ ] 5.5 Archive.
