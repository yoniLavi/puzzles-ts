# audit-game-colour-palette

## Why

**Every colour in the collection is currently a hand-written RGB triple, so there
is no single place where "the hint colour" exists.** A survey of the 57 ported
games found **388 raw RGB literals across 56 of them**, using **108 distinct
values** — and the duplication has already drifted:

| Role | Spelled as | Sites |
| --- | --- | --- |
| Hint | `[0.13, 0.5, 0.85]` **and** `[0.62, 0.81, 0.96]` | 20 (`COL_HINT` in both) |
| Hint wash | `[0.82, 0.9, 0.99]` **and** `[0.85, 0.92, 0.99]` | 18 (`COL_HINT_CELL` in both) |
| Error / mistake | `[1, 0, 0]` under four names — `COL_ERROR`, `COL_MISTAKE`, `COL_NUM_ERROR`, `COL_ERRORDIST` | 35 |
| Ink | `[0, 0, 0]` | 85 |
| Paper | `[1, 1, 1]` — and `[1.0, 1.0, 1.0]` | 28 |
| Green | `[0, 1, 0]`, `[0, 0.7, 0]`, `[0, 0.5, 0]` | 20 |

Two of those rows are the point. **`COL_HINT` is one name for two different
colours**, and **`COL_HINT_CELL` is one role whose two values differ by less than
anyone can see** — a difference nobody chose, that no test can catch, and that a
theme would nonetheless have to reproduce twice. The error red arrives under four
names in different games, and `[1, 0, 0]` is *also* Bridges' `COL_BARRIER`, so the
value cannot even be searched on to find the role.

The consequence for theming is concrete: a second colour scheme today would have to
be expressed as 57 per-game palettes plus the 30 index-keyed dark-mode patch lists
in `augmentation.ts`, and "make hints teal" would mean editing ~20 files and hoping
you found every spelling. **This change builds the vocabulary that makes a theme a
one-file edit later. It does not build the theme.**

There is already precedent for the shape: `engine/colour-mkhighlight.ts` gives every
game its background/highlight/lowlight trio (35 of 57 games import it) and
`correctRegionColour(background)` is exactly one shared *semantic* role, introduced
for the same reason — "a green invented for Separate/Palisade was the inconsistency
this rule exists to prevent". This change generalises that from one role to the set.

## What Changes

- **A shared semantic palette module** (`src/native/engine/palette.ts`) naming the
  colour *roles* two or more games use to mean the same thing to the player, in two
  forms: **absolute** constants, and **background-derived** functions (the shape
  `correctRegionColour(bg)` already uses) for roles that must stay legible after the
  app's dark-mode adaptation.
- **An audit of all 57 games**, replacing raw literals with those roles and
  **reconciling each drifted duplicate to one value** — a deliberate, recorded
  visual decision per role, not a mechanical substitution (design D4).
- **An explicit per-game exception list** for colours that are that game's *identity*
  rather than a shared role — Guess's peg colours, Map's four region colours,
  Samegame's tile set, Mines' number colours, Flood's palette. Forcing an enumerated
  set into shared roles would be the `PointerAction` mistake (design D3).
- **A guard** so the audit cannot silently regress: a colour that is neither a
  palette role nor a declared game-local exception fails the suite (design D7).
- **Palette index order stays frozen.** `augmentation.ts` patches 19 games'
  `paletteOverrides` and 11 games' `paletteSwaps` **by colour index**; reindexing
  would silently mis-target dark mode (design D5, playbook §3.3).

Explicitly **not** in this change:

- **Any theme, theme mechanism, theme picker or second colour scheme.** The
  deliverable is the vocabulary and the audit. The acceptance test for "did this
  succeed?" is that changing a role's value afterwards is a one-line edit in one
  file — *not* that a theme exists.
- **Re-tuning colours for their own sake.** A value changes only where two spellings
  of one role must be reconciled, or where a colour is a genuine defect (invisible
  against its own background). Slide's author-flagged palette items stay in their own
  follow-up (`2026-07-30-add-slide-ts-port`, tasks §10).
- **The dark-mode adaptation layer** in `puzzle-view.ts`/`augmentation.ts`. This
  change must fit it, not rework it — though it should leave a note on how much of
  the per-index patching becomes unnecessary once roles are shared, as input to a
  future theming change.

## Impact

- Affected specs: `ts-engine` (a new shared-palette requirement alongside the two
  existing mkhighlight ones).
- Affected code: new `src/native/engine/palette.ts`; every game's `colours()` and any
  render module holding a literal (56 of 57 game dirs); a new guard test.
- **Render snapshots will move** for every game whose reconciled role changed value.
  That churn is the mechanism by which a wrong reconciliation becomes visible, so it
  is reviewed diff-by-diff and never re-baselined blind (design D4).
- No runtime, bundle or save-format impact: the palette is computed per game exactly
  as now, from the same `defaultBackground`, at the same indices.
