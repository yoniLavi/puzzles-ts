# Tasks — refile-misplaced-artefacts

Independent of the other two reorg changes; can land before, between or after —
with one ordering note in 1.2 if `retire-native-directory` has not landed yet.

## 1. Delete `docs/tilings/`

- [ ] 1.1 **Before deleting, confirm the link that replaces it.** `hat.ts`'s
      header already points at upstream's live write-up
      (`chiark.greenend.org.uk/~sgtatham/quasiblog/aperiodic-tilings/`) and tells
      the reader to read it first. Check `spectre.ts` and `penrose.ts` carry an
      equivalent pointer and add one where they do not — the link is the
      load-bearing part, the local copy is a second copy of it.
- [ ] 1.2 Skim the two HTML pages against the TS for anything the write-up does
      *not* cover and the code does not explain — a table's provenance, a
      convention in the kitemap encoding. If such a thing exists, it belongs as a
      comment in `hat-tables.ts` / `spectre-tables.ts`, which is where a reader
      of the generated data would look. Expected to be empty; do the pass anyway,
      because "the URL covers it" is the assumption the deletion rests on.
- [ ] 1.3 `git rm -r docs/tilings`. Recoverable from git history and from
      upstream's repository if ever wanted.
- [ ] 1.4 Remove the `docs/tilings/` bullet from `AGENTS.md`.

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
      specs": `docs/` holds this project's guides, and a third-party reference is
      carried as a link to its maintained source rather than a copy.
- [ ] 5.2 `build-pipeline` — MODIFIED "Refactoring metrics are measured on demand
      and ratcheted in the gate": a round's snapshot is committed under the
      change that produced it; `metrics/` holds only live instruments.
- [ ] 5.3 `repo-layout` — the root entry-point-directory list loses `metrics/`.
      (Sequencing note: if `retire-native-directory` is still unarchived, add
      this to its "Repo root holds product-level config only" delta instead of
      writing a competing one.)
- [ ] 5.4 **Sweep the pending changes under `openspec/changes/`** (not
      `archive/`) for paths this change invalidates — `docs/tilings/`,
      `metrics/<date>/`, `scripts/colour-*.test.ts`,
      `scripts/diff.vitest.config.mts`. A stale path in an unstarted change is a
      step someone will execute verbatim, which is worse than a stale path in a
      spec or an archive.
- [ ] 5.5 `openspec validate refile-misplaced-artefacts --strict`, and
      re-validate every pending change touched by 5.4.
- [ ] 5.6 Archive.
