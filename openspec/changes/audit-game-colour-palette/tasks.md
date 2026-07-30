# Tasks — audit-game-colour-palette

> **Sequence this; do not land it as one commit.** 56 game dirs and ~388 sites: the
> roles module first, then games in reviewable batches, each its own commit with the
> gate green. A single 400-site diff would be unreviewable, and the snapshot churn is
> the only thing that makes a wrong reconciliation visible (design D4).

## 1. Settle the two open questions first

- [ ] 1.1 Resolve the ink/paper scope with the owner (design "Open questions" §1):
      map every black/white, or only those acting as a *fill*. This roughly halves or
      doubles the change, so it comes before any migration.
- [ ] 1.2 Determine whether `COL_HINT`'s two values are one drifted role or genuinely
      two (action vs wash) — read the ~20 sites before assuming (§2).

## 2. Complete the survey into a reviewable inventory

- [ ] 2.1 Produce a table of every colour in every game: game, palette index, local
      enum name, current value, proposed role (or "local"), and — where the value
      changes — the before/after. This inventory is the artefact the audit is reviewed
      against; commit it under the change directory.
- [ ] 2.2 For each candidate role, count its *real* consumers and drop any with fewer
      than two (design D2 — a role with one adopter is phantom API).
- [ ] 2.3 Flag every game whose reconciled colours sit at an index patched by
      `augmentation.ts` `paletteOverrides`/`paletteSwaps`. This list drives the
      dark-mode checks in §5 and is where the likeliest regression lives (design D4).

## 3. The shared roles module

- [ ] 3.1 `src/native/engine/palette.ts`: the roles from §2.2, as absolute constants
      or background-derived functions per design D1. Document *per role* what it means
      to the player and why it is absolute or derived.
- [ ] 3.2 Move or re-export `correctRegionColour` so the roles live together; leave
      `mkhighlight`/`mkhighlightSpecific`/`mkhighlightBackground` where they are —
      `colour-mkhighlight.ts` keeps owning structural colour (design D1).
- [ ] 3.3 Record each reconciliation (which value won, why) in `design.md`.
- [ ] 3.4 Tier-1 tests for the derived roles: each stays distinguishable from the
      background it was derived from, at a light background *and* at the pure white the
      app passes in dark mode.

## 4. The guard

- [ ] 4.1 A test that resolves `colours(background)` for every registered game and
      requires each entry to be traceable to a role, the mkhighlight trio, or an
      explicit per-game exception list (design D7).
- [ ] 4.2 Populate the exception list with the identity-colour games (design D3:
      guess, map, samegame, flood, mines, net, loopy, galaxies, …), each with a
      one-line reason. A colour that is neither a role nor declared fails.
- [ ] 4.3 Confirm the guard actually fails on a planted raw colour — a guard nobody
      has seen fail is not yet a guard.

## 5. Migrate the games, in batches

- [ ] 5.1 Batch the 56 dirs so each commit is reviewable, hint-bearing games first
      (they carry the two drifted roles, so they exercise the reconciliation path).
- [ ] 5.2 Per batch: replace literals with roles, keep every palette **index** exactly
      where it is (design D5 — never reindex), run the gate.
- [ ] 5.3 Per batch: review each moved render snapshot **as a diff** before
      re-baselining. Never a blind `vitest -u` (design D4).
- [ ] 5.4 For the games flagged in §2.3, check the board in **both** colour schemes in
      the browser — a reconciliation tuned against the old value can look right in
      light mode and wrong in dark.
- [ ] 5.5 Leave each game's local enum names alone unless they are actively
      misleading; the values move, not the index-mapped names.

## 6. Close out

- [ ] 6.1 Note in `design.md` how much of `augmentation.ts`'s per-index dark-mode
      patching becomes redundant once roles are shared — the input a future theming
      change needs, cheapest to capture while auditing.
- [ ] 6.2 Update `docs/porting/game-port-playbook.md` §3.3: a new port takes its
      player-facing colours from the roles module, and declares anything genuinely
      game-local. This is what stops the drift returning with port #58.
- [ ] 6.3 Confirm the acceptance criterion (design D6): changing a role's value is a
      one-line edit in one file, with no game touched. Demonstrate it, don't assert it.
- [ ] 6.4 Full gate green; `openspec validate audit-game-colour-palette --strict`.
- [ ] 6.5 Owner acceptance (this change is visible in every game), then archive.
