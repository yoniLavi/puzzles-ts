# Tasks — tidy-measurement-artefacts

Independent of the other two reorg changes; can land before, between or after.

## 1. Relocate the finished round's snapshots

- [ ] 1.1 `git mv metrics/2026-08-01/` and `metrics/2026-08-01-config-helpers/`
      and `metrics/2026-08-01-after/` under the archived changes that produced
      them. Keep each `summary.md` with its own raw output — a summary separated
      from the numbers it summarises stops being checkable.
- [ ] 1.2 Add a one-paragraph README beside them recording what the round was and
      that the snapshots **cannot be regenerated** (they measure a tree that no
      longer exists), so a later reader does not try.
- [ ] 1.3 Repoint `docs/porting/game-port-playbook.md`'s reference to the
      committed `metrics/<date>/` snapshot.
- [ ] 1.4 Confirm `metrics/` now holds only `mutation/report.json`, and that
      `docs/test-strength.md`'s reference to it still resolves.

## 2. `scripts/checks/`

- [ ] 2.1 `git mv scripts/colour-{inventory,collide,dark-check}.test.ts` and
      `scripts/diff.vitest.config.mts` into `scripts/checks/`.
- [ ] 2.2 Update the config's `include` globs (they name `scripts/…` paths), the
      `diff` script in `package.json`, and the usage comment at the top of the
      config.
- [ ] 2.3 **Run `npm run diff`.** These files are outside the gate, so nothing
      else would notice a broken path — which is exactly why the move has to be
      exercised rather than assumed.
- [ ] 2.4 Confirm the main `vitest.config.ts` still cannot pick them up: its
      `include` is `src/**/*.test.ts`, so `scripts/checks/` stays out of the gate
      by construction, not by luck.

## 3. Stryker's sandbox

- [ ] 3.1 Set `tempDirName` in `scripts/stryker.config.mjs` to a path outside the
      project tree.
- [ ] 3.2 Delete the five stale `.stryker-tmp/sandbox-*` copies (192 MB), and
      remove the now-dead `/.stryker-tmp/` entry from `.gitignore` — an ignore
      rule for a directory the tool no longer writes is the same false signal
      this change is about.
- [ ] 3.3 Run `npm run mutation` far enough to confirm it creates its sandbox in
      the new location and the run starts, then stop it. A full mutation run is
      ~400 minutes and is not needed to verify a path.

## 4. Specs and close-out

- [ ] 4.1 `build-pipeline` — MODIFIED "Refactoring metrics are measured on demand
      and ratcheted in the gate": a round's snapshot is committed under the
      change that produced it; `metrics/` holds only live instruments.
- [ ] 4.2 `repo-layout` — the root entry-point-directory list loses `metrics/`.
      (Sequencing note: if `retire-native-directory` is still unarchived, add
      this to its "Repo root holds product-level config only" delta instead of
      writing a competing one.)
- [ ] 4.3 `openspec validate tidy-measurement-artefacts --strict`.
- [ ] 4.4 Archive.
