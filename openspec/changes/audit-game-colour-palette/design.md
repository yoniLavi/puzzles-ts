# Design — audit-game-colour-palette

## Context

### The three layers that exist today

1. **Each game's `colours(defaultBackground): Colour[]`** returns RGB components in
   0..1, at indices mirroring its upstream C colour enum. Colours are written as raw
   triples in the game's `render.ts` (or `index.ts`).
2. **`src/puzzle/puzzle-view.ts`** converts that palette to OKLCH, then in dark mode
   applies per-puzzle `darkMode.paletteOverrides` (19 games) and `paletteSwaps`
   (11 games) from `src/puzzle/augmentation.ts` — both keyed by **colour index** —
   then tints greys toward the host background hue and emits CSS.
   Note the load-bearing detail: in dark mode the app passes the game **pure white**
   as its `defaultBackground`, *because* upstream games derive colours as
   `background × 0.9`, and adapts the returned palette afterwards.
3. **`src/native/engine/colour-mkhighlight.ts`** is the only shared colour code:
   `mkhighlightBackground`, `mkhighlight` (the bg/highlight/lowlight trio),
   `mkhighlightSpecific` (the same from an arbitrary base), and
   `correctRegionColour(bg)` — one shared *semantic* role. 35 of 57 game dirs import
   it.

So the structural/bevel colours are already shared. What is not shared is every
colour that means something to the *player*.

### The survey (measured, not estimated)

Across the 282 non-test files in `src/native/games/`:

- **388 raw RGB triples**, in **56 of 57 game dirs**, using **108 distinct values**.
- **`COL_HINT` is two different colours**: `[0.13, 0.5, 0.85]` (13 sites) and
  `[0.62, 0.81, 0.96]` (7 sites).
- **`COL_HINT_CELL` is two values that differ imperceptibly**: `[0.82, 0.9, 0.99]`
  (10 sites) and `[0.85, 0.92, 0.99]` (8 sites).
- **The error red `[1, 0, 0]` (35 sites) arrives under four names** — `COL_ERROR`
  (27), `COL_MISTAKE` (6), `COL_NUM_ERROR`, `COL_ERRORDIST` — and the same value is
  also `COL_BARRIER`, a different meaning, so the value is not even a reliable way to
  find the role.
- `[0, 0, 0]` 85 sites; `[1, 1, 1]` 26 plus `[1.0, 1.0, 1.0]` 2 (the same colour,
  two spellings); three unrelated greens `[0, 1, 0]`, `[0, 0.7, 0]`, `[0, 0.5, 0]`.

The drifted pairs are the strongest evidence, and worth being precise about *why*:
nobody decided that Palisade's hint should be a different blue from Towers'. The
divergence is an artefact of each port writing its own triple, and it is invisible
to every test we have, because a snapshot records whatever the game emits.

## Decisions

### D1 — Two forms of role: absolute constants and background-derived functions

A role is one or the other, and which it is follows from whether it must survive the
dark-mode adaptation:

- **Absolute** (`export const COL_ERROR_INK: Colour = …`) for a colour whose whole
  job is to be unmistakable — the error red. The app's OKLCH pass adapts it; it does
  not need to track the board.
- **Background-derived** (`export function hintWash(bg: Colour): Colour`) for any
  role that must stay *legible against the board*, following the shape
  `correctRegionColour(bg)` already uses. This is not optional stylistic preference:
  because `puzzle-view.ts` hands the game pure white in dark mode, a fixed pale
  colour that reads correctly in light mode can land on top of the background in
  dark mode. The playbook already records this exact failure (Spokes' `COL_DONE`
  white-on-white).

`palette.ts` deliberately does **not** re-export or wrap the mkhighlight trio —
`colour-mkhighlight.ts` owns structural colour and keeps owning it. The new module is
for player-facing roles only.

### D2 — Candidate roles, from the survey rather than from imagination

The starting set is the roles the survey shows two or more games already using with
the same meaning. Implementation confirms each against the games before promoting it,
and **drops any that turns out to have only one real consumer** — a role shipped with
one adopter is the `PointerAction` mistake (a hook added with no second user, later
deleted as phantom API).

- **error / mistake** — the four-named red. One role; the games' local enum names may
  stay (they are index-mapped), but the *value* comes from here.
- **hint action** — the strong hint colour (currently two blues).
- **hint wash / hint area** — the pale hint background (currently two near-identical
  values).
- **hint sibling / secondary** — Palisade's `COL_HINT_SIBLING` and its analogues.
- **cursor** — the keyboard-cursor cue.
- **correct region** — already exists as `correctRegionColour`; moves or re-exports so
  the roles live together.
- **ink / paper** — the 85 blacks and 28 whites. Needs the most care: many are
  genuinely "black text on this tile" and some are a *tile* colour that must react to
  the background. Implementation splits them rather than mapping all 113 to two
  constants.

### D3 — What must stay game-local, and the test for it

**A colour is a shared role only if two or more games use it to mean the same thing
to the player.** It stays local when it is part of that game's visual *identity* or a
member of its own enumerated set — where the colours' job is to be distinguishable
from *each other*, not to carry a meaning that recurs elsewhere:

- **Guess** (16 triples) — the peg colours *are* the game.
- **Map** (8) — the four region colours.
- **Samegame** (11) — the tile colour set.
- **Flood** (11) — likewise.
- **Mines** (16) — the per-number digit colours (upstream's convention).
- **Net** (5), **Loopy** (5), **Galaxies** (6) — small game-specific sets.

These are **declared as exceptions, not left undeclared** (D7), so the distinction is
recorded once and a *new* raw colour still has to justify itself.

### D4 — Reconciling a drifted duplicate is a visual decision, made once and recorded

For each role with more than one current value, the change picks one. That is a
deliberate visual change to every game on the losing side, so:

- Record which value won and why, per role, in this file. Prefer the value with more
  adopters *unless* the minority value is demonstrably better (e.g. the majority one
  fails contrast against some game's background).
- **Never re-baseline snapshots blind.** Every moved snapshot is reviewed as a diff;
  `vitest -u` is the last step after reading it, not the first. The playbook is
  explicit that a careless `-u` erases the guarantee.
- **Check both colour schemes** for any reconciled colour whose index appears in that
  game's `augmentation.ts` `paletteOverrides`/`paletteSwaps`. A reconciliation can
  look right in light mode and wrong in dark, because the patch was tuned to the old
  value. This is the single most likely way for this change to ship a regression.

### D5 — Palette index order is frozen; appending is safe, reordering is not

`augmentation.ts` patches 30 games' palettes **by index**. Reindexing a palette
silently mis-targets those patches — the game looks right in light mode and wrong in
dark, with nothing failing. So the audit changes *values and their spelling*, never
positions. A new role that a game needs at a new index is **appended** past its
upstream enum (the convention Towers, Range and Spokes already use). Normative in
playbook §3.3.

### D6 — Theming is out of scope, and the success criterion says so

The temptation is to design the theme while the vocabulary is fresh. Resisted: a
theme needs decisions this change has no basis for (how many themes, per-puzzle or
global, persisted where, what happens to the OKLCH adaptation and the 30 per-index
patches). Doing both at once would also make the audit's large, reviewable diff
unreviewable.

So the acceptance criterion is deliberately about *reachability*, not features:
**after this change, changing a role's value is a one-line edit in one file, and no
game needs touching.** A short note goes in this file on how much of the per-index
dark-mode patching becomes redundant once roles are shared — that is the input a
future theming change needs, and the cheapest moment to capture it is while auditing.

### D7 — The guard: declare-or-fail, not a regex hunt

A test that greps game source for `[` is brittle and easy to work around. The
intended shape instead makes the *palette itself* the subject: for every registered
game, resolve `colours(background)` and require each entry to be either
(a) traceable to a palette role or the mkhighlight trio, or (b) present in an explicit
per-game exception list (D3). A new hand-written colour then fails until it is either
mapped to a role or declared local — which is the behaviour wanted, since the failure
mode this change exists to prevent is *silent* divergence.

Implementation settles the mechanism (a resolved-value comparison is simplest; a
source-level lint rule is the fallback). What matters is that "I added a colour and
nobody noticed" stops being possible.

## What implementation found and decided

### F1 — The two hint blues are two roles, not one drift (D2/§1.2 answered)

The owner read `[0.13, 0.5, 0.85]` and `[0.62, 0.81, 0.96]` as the same role and asked
implementation to look for a case needing them distinguished. **There is one, and it is
load-bearing.**

The split is perfectly clean along two families: the grid/shading games use the
saturated blue, and the Latin/digit family (Solo, Keen, Towers, Unequal, Undead,
Filling, Group) — *all seven of them* — use the pale one. That is not drift, it is
function. In the digit games the hint colour is a **solid fill painted behind a digit
and its pencil marks**, and Towers' renderer says so:

> *"painting the cell COL_HINT as well would hide the very digit the hint is crossing
> out (blue-on-blue)."*

In the grid games it is a stroke, or a fill on a cell carrying no text. Collapsing them
to the majority value would have painted dark blue behind black digits in seven games.

So the model is **three** hint emphases, not two: `HINT_ACTION` (saturated, drawn *on*
the board), `HINT_FILL` (pale, a fill *behind* text), `HINT_EVIDENCE` (palest, the
context a deduction reasons from). `palette.test.ts` pins that they stay distinct and
ordered light-to-dark.

### F2 — Reconciliations made (D4)

Everything else was either spelling-only or a genuine near-miss. Only **19 sites**
changed value at all; the other ~193 are the same colour written a different way.

| Role | From | To | Games |
| --- | --- | --- | --- |
| `HINT_EVIDENCE` | `[0.85, 0.92, 0.99]` | `[0.82, 0.9, 0.99]` | 8 (imperceptible) |
| `HINT_EVIDENCE` | `[0.7, 0.84, 0.98]` | `[0.82, 0.9, 0.99]` | pattern, unruly |
| `HINT_ACTION` | `[0.13, 0.4, 0.75]` / `[0.3, 0.5, 0.9]` | `[0.13, 0.5, 0.85]` | salad, netslide |
| `ERROR` | `[0.9, 0, 0]`, `[0.85, 0.1, 0.1]`, `[0.85, 0, 0]`, `[0.85, 0.0, 0.0]` | `[1, 0, 0]` | clusters, galaxies, magnets, tents |
| *(spelling only)* | `[1.0, 0.0, 0.0]`, `[1.0, 1.0, 1.0]` | `[1, 0, 0]`, `[1, 1, 1]` | tents, map, mosaic |

**Kept local** where the value is load-bearing, by the same reasoning as F1:

- **Light Up's `COL_ERROR` `[1, 0.25, 0.25]`** is a pale red *fill* behind a lit cell
  (`render.ts:226`), not only an outline. Its paleness does the job `HINT_FILL`'s does.
- **Subsets' `COL_HINT_CELL` `[0.55, 0.75, 0.95]`** is materially darker than the wash
  and sits inside its own three-level hint vocabulary (`COL_HINT_SPOT`,
  `COL_HINT_PLACED`).
- Genuinely different hues that happen to share a name: Inertia's yellow `COL_HINT`,
  Crossing's green one.

### F3 — The dark-mode risk cleared analytically, not by eye (D4's main hazard)

Cross-checking every reconciled index against `augmentation.ts` found only two overlaps
— solo's `COL_GRID` (index 2, `paletteOverrides {2: 0.8}`) and galaxies' `COL_EDGE`
(index 6, `{6: 0.8}`) — and **both are `[0, 0, 0]` → `INK`, an identical value**. So no
value-changing reconciliation lands on a dark-mode-patched index, and the "looks right
in light mode, wrong in dark" failure cannot have been introduced. Worth doing this way
round: it is a two-minute check that would otherwise have been an unbounded eyeball
across 30 games.

### F4 — The guard had to be per-*colour*, not per-*game*

The first cut listed exempt **games**. That is nearly worthless: once a game is on the
list it can add any colour it likes, which is exactly the silent drift being guarded
against. Every one of the 57 games has some local colour, so a per-game list could never
fail for anyone.

`GAME_LOCAL` therefore declares the **294 specific colours** 56 games own, as values. A
game may keep those; a *new* colour still fails until it is mapped to a role or added
deliberately. Verified by planting `[0.99, 0.01, 0.02]` in Palisade and watching the
guard name it (`index 5`), then restoring — task 4.3's "a guard nobody has seen fail is
not yet a guard".

### F5 — Naming: roles deliberately drop the `COL_` prefix

Throughout this codebase `COL_*` means "a palette **index**", and every game declares
its own `COL_ERROR`, `COL_HINT` and so on, mapped to its upstream C enum. Importing a
role named `COL_ERROR` collides with the game's own index constant in the same scope. So
the roles are `INK`, `ERROR`, `HINT_ACTION`, … and a game writes
`out[COL_ERROR] = ERROR;` — the two namespaces stay separate and every game's indices
keep matching its C reference. (`HINT_AREA` was also already taken as a draw-state flag
bit in Filling and Salad, so the evidence role is `HINT_EVIDENCE` — which is the more
precise name anyway.)

## Risks

- **Blast radius.** 56 game dirs, ~388 sites. Mitigation: sequence it — roles module
  first, then games in reviewable batches, each its own commit, gate green per batch.
  The change is dull but wide, and a single 400-site commit would be unreviewable.
- **A reconciliation that regresses dark mode only.** The highest-likelihood defect
  (D4). Mitigation: for every reconciled colour, check whether its index is patched in
  `augmentation.ts` and eyeball both schemes for those games specifically.
- **Over-abstraction.** The pressure in a change like this is to promote every
  recurring value to a role, including the ones that recur by coincidence. D2's
  "drop any role with one real consumer" and D3's identity carve-out exist to
  counter that; when in doubt, leave it local and record why.
- **Snapshot churn hiding a real change.** A large re-baseline is exactly where an
  unintended render change slips through. Mitigation: D4's review-the-diff rule, plus
  the targeted op assertions each render test carries alongside its snapshot (those
  do not move when only a colour value changes, so a *structural* change stands out).
- **Scope creep into theming.** Guarded by D6's criterion.

## Questions answered by the owner (2026-07-30)

1. **Ink/paper scope: do the full thing.** The recommendation was to map only fills
   and leave pure text/outline black alone; the owner chose **(a) map them all**, and
   said explicitly that a big diff is fine. So the goal is the literal one — *every*
   colour in every game reaches a named constant — and the exception list carries only
   genuine identity colours (D3), not "this one was tedious".
2. **The two hint values are one role.** The owner reads `[0.13, 0.5, 0.85]` and
   `[0.62, 0.81, 0.96]` as the same role and left the check to implementation: unify
   them, and only split if a *concrete* situation turns up where a game needs the two
   distinguished. That is the right default — an invented distinction is harder to
   remove later than a missing one is to add. Recorded in D4 as the reconciliation is
   made.
