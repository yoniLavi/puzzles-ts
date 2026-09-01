# Tasks — document-hint-feature

> These pages are **product**, not reference. Read the existing
> [`help/features.md`](../../../help/features.md) first and match it: second
> person, `::icon::` glyph references, `<command-link>` for anything reachable
> from preferences, and an anchor (`{#name}`) on every heading because other
> pages link to them.

## 1. The two decisions (both settled — see design)

- [x] 1.1 **The "checkpoint" collision** (design D2) — settled by the owner,
      2026-08-12: rename, so "checkpoint" means one thing everywhere. Scope is
      **all four** strings in `src/puzzle/quick-save-actions.ts`, not the toast
      label alone. Done *with* the prose, so the page and the app land in step.
- [x] 1.2 **What the coverage guard derives from** (design D1) — the game
      hooks, made fail-closed via the optional-`Game`-member classification,
      plus the derived populations and the glyph resolution. Decided before the
      prose, because the anchors are the contract.

## 2. Write the hint section

- [x] 2.1 `## Hints {#hints}` in `help/features.md`, leading with what makes it
      *this* fork's hint: it explains **why** a move is forced, not just which.
- [x] 2.2 The **stepper rhythm** — show, then apply, with any intervening action
      re-arming the show. Verified in the browser: press one leaves `totalMoves`
      at 0, press two takes it to 1, and a press after an undo does not apply.
- [x] 2.3 **Auto-Hint** — the toolbar play/pause, a second a step, floored by
      each move's own animation, stopping on solved and on a refusal.
- [x] 2.4 **Refusal on a contradictory board** — it refuses *and lights the
      offending squares*. Written to generalise, because it is the **midend**
      that does this on every refusal path (`computeHintPlan` → `findMistakes`),
      not three games' individual wording.
- [x] 2.5 **The legend, once — shape first** (design D4): ring beside the
      content for what the hint acts on, outline (or shade) for the evidence,
      small ordinals for a chain's order and no arrows. Colour named only as a
      secondary cue.
- [x] 2.6 The **rule** governing which puzzles have a hint, naming no games.
- [x] 2.7 **The other refusal: deduction running out**, distinguished from 2.4
      and cross-linked to §Difficulty.

## 2a. Say what "Unreasonable" promises

> Owner request, 2026-08-11, out of `add-galaxies-hint` acceptance. The rule the
> collection holds, now normative in `ts-engine`: **a tier whose boards can
> require Search is named `Unreasonable`, and no other tier name may be.**

- [x] 2a.1 `## Difficulty {#difficulty}` states the contract in the player's
      terms. Avoids "guessing versus checking", superseded by
      `audit-guessing-tier-names` D9 (design D4).
- [x] 2a.2 Tied to the hint: on such a board it says it has run out rather than
      guessing for you.
- [x] 2a.3 Names undo, the saved position and checkpoints as what makes
      trial-and-error cheap, linking §Checking and §Checkpoints.
- [x] 2a.4 **No games named.** The guard asserts the section exists for as long
      as any game declares the tier, and reports the count (13) itself.

## 3. Write the checking section

- [x] 3.1 `## Checking your work {#checking}`: what the highlighting proves,
      what it does not (missing is not mistaken), and that it is **ephemeral** —
      the midend drops it on the next transition.
- [x] 3.2 **Check & save / Quick-save + Quick-load**, the adaptive label, the
      **hard block** that leaves the previous save intact, and Cmd/Ctrl+S.
      Verified in the browser on a board with two deliberate mistakes.
- [x] 3.3 Applied 1.1: all four strings renamed, and the success toast now
      confirms the *check* on a checking game ("No mistakes — quick-saved") —
      the flagged extra line in design D2. `puzzle-screen.test.ts` asserts both
      labels.
- [x] 3.4 Cross-links: §Checkpoints ↔ §Checking, and the hint refusal ↔ the
      mistake overlay (they are the same overlay).

## 3a. The two remaining fork controls

- [x] 3a.1 `## Filling in all the pencil marks {#mark-all}`. Corrected against
      the code while writing: the press is **adaptive**, not a blanket fill — it
      fills only squares with no marks and never resets a narrowed one, and in
      nine of the ten games a further press strikes out what is now impossible.
- [x] 3a.2 `## The reference panel {#reference}`, including that closing the
      panel deliberately keeps the highlight, and how to clear it.

## 4. The guard

- [x] 4.1 **Classification.** `src/help-coverage.test.ts` reads every optional
      `Game` member off the `game.ts` AST and requires each to be classified
      `features § anchor` / `upstream` / `internal`. Unclassified fails; a
      classified anchor the page does not define fails; a classification naming
      a member the contract no longer has fails.
- [x] 4.2 **Derived populations.** §Right mouse's seven-game list is asserted
      equal to `ignoresSecondaryButton`; any game whose `difficulty.tiers` names
      `Unreasonable` requires `{#difficulty}`.
- [x] 4.3 **Glyph resolution.** Landed in `vite-plugins/extra-pages.ts`, not in
      the test, and the design note says why: **Vitest stubs every CSS import to
      the empty string**, `?raw` included, so the test cannot read `help.css` at
      all — its own vacuity guard convicted the first attempt. The plugin can,
      it already holds the icon name, and it is where the TODO asking for this
      check was written; `vite build` is in the pre-commit gate. The TODO is
      deleted. Seven new `.icon-*` rules added. What stays in the test is the
      direction needing no stylesheet: help glyphs vs the app's icon names.
- [x] 4.4 **Proved each fails.** Deleted `{#hints}` → red; added an unclassified
      optional member to `Game` → red; dropped Sokoban from the §Right mouse
      list → red; renamed `{#difficulty}` → red (reporting "13 games"); a
      `::hint-probe::` glyph → `vite build` failed with the plugin's message;
      renamed an app icon → red. All restored.
- [x] 4.5 **Vacuity guards** on every derivation: the member list is non-empty
      and contains `hint`, the anchor set is non-empty, both populations are
      non-empty, the pages were found and the glyph pattern matched. The
      stylesheet one lives in the plugin (`no .icon-* rules found` throws).
- [x] 4.6 No check is a grep for a spelling: each aims at a resolved structure —
      an anchor, a flag, an AST member, a CSS rule.
- [x] 4.7 Retired the dead recipe in `src/icons.ts` ("Sync changes to
      `logicalIconNames` in `vite-extra-pages.ts`" — neither the symbol nor the
      filename exists anywhere in the repo), replaced with the coupling that is
      real and now enforced.

## 4a. Found on the way

- [x] 4a.1 `src/engine/mark-all.test.ts`'s enrolment check asserted that every
      **listed** game declares `canMarkAll` — a statement about the list, which
      could not fail for the miss its own comment described (a game declaring
      the flag with no row, therefore unguarded by every property in the file).
      Now derived from the registry in both directions, with a vacuity floor;
      both failure directions proved.

## 5. Close out

- [x] 5.1 `help/differences.md`: hints and mistake checking added to the list of
      changes affecting all puzzles — the flagship divergence was missing from
      the page whose whole job is listing divergences — and the Light Up bullet
      now points at §Difficulty instead of re-explaining the tier locally.
- [x] 5.2 Per-game pages checked, and two needed the matching edit: `galaxies.md`
      said "save a checkpoint" for the one-slot save (the word this change gave
      back to the history panel), and both it and `bricks.md` explained the
      `Unreasonable` promise locally, so both now link the shared section.
- [x] 5.3 Read against the running app, clicking each control: the stepper's two
      beats and its re-arm, the blocked save (modal, previous save intact, cells
      lit), both toasts' new wording, Quick-load, Mark-all as an undoable move,
      and every glyph on the rendered page resolving to a real image.
- [ ] 5.4 Full gate green.
- [ ] 5.5 Owner acceptance, then archive.
