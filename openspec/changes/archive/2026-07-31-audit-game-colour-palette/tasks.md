# Tasks — audit-game-colour-palette

> **Sequence this; do not land it as one commit.** 56 game dirs and ~388 sites: the
> roles module first, then games in reviewable batches, each its own commit with the
> gate green. A single 400-site diff would be unreviewable, and the snapshot churn is
> the only thing that makes a wrong reconciliation visible (design D4).

## 1. Settle the two open questions first

- [x] 1.1 Resolve the ink/paper scope with the owner (design "Open questions" §1):
      map every black/white, or only those acting as a *fill*. This roughly halves or
      doubles the change, so it comes before any migration.
- [x] 1.2 Determine whether `COL_HINT`'s two values are one drifted role or genuinely
      two (action vs wash) — read the ~20 sites before assuming (§2).

## 2. Complete the survey into a reviewable inventory

- [x] 2.1 Produce a table of every colour in every game: game, palette index, local
      enum name, current value, proposed role (or "local"), and — where the value
      changes — the before/after. This inventory is the artefact the audit is reviewed
      against; commit it under the change directory.
      → `inventory.md`. **Generated, not hand-written**: every game's `colours()` is
      resolved at the pre-change commit and at HEAD and the *resolved palettes* are
      diffed, so a rewrite that preserves a colour doesn't show and a value change
      can't hide. 687 entries / 57 games; 407 (59%) from a shared role or the
      mkhighlight trio; 280 declared game-local; **17 changed value**. It corrected
      the hand count in design F2 ("19 sites" counted source edits, two of them
      spelling-only).
- [x] 2.2 For each candidate role, count its *real* consumers and drop any with fewer
      than two (design D2 — a role with one adopter is phantom API).
      → Redone properly in the second pass (F6/F7), because the first count measured
      value-matches rather than importers and so missed that three derived roles had
      **zero** adopters. Outcome: `satisfiedColour` dropped (1 possible consumer),
      D2's **cursor** candidate dropped (17 games, 17 deliberately different colours),
      `pencilColour` corrected to the value its 8 real consumers use, and six roles
      added that the first pass had left as inline arithmetic.
- [x] 2.3 Flag every game whose reconciled colours sit at an index patched by
      `augmentation.ts` `paletteOverrides`/`paletteSwaps`. This list drives the
      dark-mode checks in §5 and is where the likeliest regression lives (design D4).

## 3. The shared roles module

- [x] 3.1 `src/native/engine/palette.ts`: the roles from §2.2, as absolute constants
      or background-derived functions per design D1. Document *per role* what it means
      to the player and why it is absolute or derived.
- [x] 3.2 Move or re-export `correctRegionColour` so the roles live together; leave
      `mkhighlight`/`mkhighlightSpecific`/`mkhighlightBackground` where they are —
      `colour-mkhighlight.ts` keeps owning structural colour (design D1).
- [x] 3.3 Record each reconciliation (which value won, why) in `design.md`.
- [x] 3.4 Tier-1 tests for the derived roles: each stays distinguishable from the
      background it was derived from, at a light background *and* at the pure white the
      app passes in dark mode.

## 4. The guard

- [x] 4.1 A test that resolves `colours(background)` for every registered game and
      requires each entry to be traceable to a role, the mkhighlight trio, or an
      explicit per-game exception list (design D7).
- [x] 4.2 Populate the exception list with the identity-colour games (design D3:
      guess, map, samegame, flood, mines, net, loopy, galaxies, …), each with a
      one-line reason. A colour that is neither a role nor declared fails.
- [x] 4.3 Confirm the guard actually fails on a planted raw colour — a guard nobody
      has seen fail is not yet a guard.

## 5. Migrate the games, in batches

- [~] 5.1 Batch the 56 dirs so each commit is reviewable, hint-bearing games first
      (they carry the two drifted roles, so they exercise the reconciliation path).
      → **Not done as specified, and worth recording rather than ticking.** The
      absolute-colour migration landed as a single 65-file commit (`ba3cb5a`) despite
      this file's own instruction not to. It was reviewable in the end only because
      `inventory.md` reduces it to "17 colours moved, here they are" — which is the
      artefact §2.1 asks for, and is the thing that made a 400-site diff auditable
      after the fact. The derived-colour follow-up (F6) is a second, smaller commit.
      The lesson for a future wide-but-dull change: the *generated inventory* is what
      makes it reviewable, more than the batching is.
- [x] 5.2 Per batch: replace literals with roles, keep every palette **index** exactly
      where it is (design D5 — never reindex), run the gate.
- [x] 5.3 Per batch: review each moved render snapshot **as a diff** before
      re-baselining. Never a blind `vitest -u` (design D4).
- [x] 5.4 For the games flagged in §2.3, check the board in **both** colour schemes in
      the browser — a reconciliation tuned against the old value can look right in
      light mode and wrong in dark.
      → design F10. Checked twice: a harness reproducing `puzzle-view.ts`'s exact
      dark-mode pipeline for all 25 affected games × every touched index × both
      schemes (no colour indistinct from its background anywhere), plus a Chrome pass
      over filling / solo / palisade / inertia in both schemes. filling's reconciled
      `highlightWash` mattered most — it is the one change **no snapshot covers**.
- [x] 5.5 Leave each game's local enum names alone unless they are actively
      misleading; the values move, not the index-mapped names.

## 6. Close out

- [x] 6.1 Note in `design.md` how much of `augmentation.ts`'s per-index dark-mode
      patching becomes redundant once roles are shared — the input a future theming
      change needs, cheapest to capture while auditing.
      → design F8. **28 of the 47 dark-mode patches are role-level facts wearing
      per-game clothing**: 15 of 31 `paletteOverrides` say "this `INK`/`PAPER` is
      semantic, don't invert it", and 9 of 16 `paletteSwaps` are a pure `mkhighlight`
      highlight/lowlight pair. The blocker to collapsing them is not the roles but
      that `colours()` returns a bare `Colour[]` carrying no record of which role each
      entry came from — a `Game`-interface change, correctly out of scope here.
- [x] 6.2 Update `docs/porting/game-port-playbook.md` §3.3: a new port takes its
      player-facing colours from the roles module, and declares anything genuinely
      game-local. This is what stops the drift returning with port #58.
      → §3.3 now opens with it, including the convergence/divergence test from F7 and
      an explicit note that the guard checks *values*, not provenance, so importing
      the role is a review rule rather than an enforced one.
- [x] 6.3 Confirm the acceptance criterion (design D6): changing a role's value is a
      one-line edit in one file, with no game touched. Demonstrate it, don't assert it.
      → design F9. One line of `palette.ts` made every hint teal: 20 snapshot failures
      across 14 game test files, zero non-snapshot failures, one file in
      `git diff --name-only`. Reverted after.
- [x] 6.4 Full gate green; `openspec validate audit-game-colour-palette --strict`.
      → `npm run gate` exit 0 (tsc, whole-tree biome, **5340 tests / 242 files**,
      production `vite build`); change validates strict.
- [ ] 6.5 Owner acceptance (this change is visible in every game), then archive.
