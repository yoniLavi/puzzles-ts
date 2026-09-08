# Tasks — simplify-chrome-after-playtest

## 1. The hint stops being urged

- [x] 1.1 `src/puzzle/components/rail.ts`: drop `emphasis: "accent"` from the
      hint row, and the `[part="row"].accent` block it selects if nothing else
      uses it.
- [x] 1.2 `src/screens/puzzle-screen.ts`: `.phone-action.hint` keeps its
      `flex: 1 1 auto` (it is still the wide control in the bar) but loses the
      `--app-color-accent` fill and the semibold weight.
- [x] 1.3 Check whether `--app-color-accent` still has a consumer. If not,
      **do not delete it silently** — it is a palette token with a recorded
      meaning; say in this change what it is now for, or retire it deliberately.
- [x] 1.4 The hint explanation panel keeps its amber
      (`--app-color-hint-surface`/`-border`/`-ink`). That is the hint *speaking*,
      not the chrome *recommending*, and the distinction is the whole point.

## 2. The intro toggle and the Options menu

- [x] 2.1 `home-screen.ts`: delete `renderOptionsMenuContent`, the
      `toggle-intro` command and its handler; render the intro unconditionally.
- [x] 2.2 Wide header: replace the `<wa-dropdown>` with a Preferences button
      beside Help. Compact header: the title stops being a dropdown trigger, and
      Preferences joins Help in `.controls` as an icon button.
- [x] 2.3 `settings.ts` / `db.ts`: remove `showIntro`.
- [x] 2.4 About keeps its footer link (`command-link command="about"`), which is
      how it stays reachable. Confirm it works from the home screen, since it is
      now the *only* route there.

## 3. Color scheme moves to Appearance

- [x] 3.1 `settings-dialog.ts`: move the color-scheme radio group from
      `renderAdvancedSection` to `renderAppearanceSection`, and drop
      "(experimental)" from its label.

## 4. Retire the unfinished-puzzle mechanism

Not just the checkbox: the flag it reads is set by no puzzle, so every surface
built on it is dead.

- [x] 4.1 `settings-dialog.ts`: remove the "Show experimental puzzles" checkbox
      and its description.
- [x] 4.2 `settings.ts` / `db.ts`: remove `showUnfinishedPuzzles`.
- [x] 4.3 `home-screen.ts`: `visibleIds` collapses to `puzzleIds`; remove the
      `unfinished` read and the catalog card's `?unfinished` binding.
- [x] 4.4 `components/catalog-card.ts`: remove the `unfinished` property and its
      badge.
- [x] 4.5 `puzzle-screen.ts`: remove the "experimental, unfinished puzzle"
      warning.
- [x] 4.6 `catalog-data.ts`: remove the `unfinished?: boolean` field and its doc
      comment.
- [x] 4.7 `icons.ts`: remove the `unfinished` icon entry **if nothing else uses
      it**; check rather than assume.
- [x] 4.8 Verify the whole word is gone from `src/` except where it is ordinary
      prose (Group's objective mentions an unfinished Cayley table, which is the
      puzzle's rules and stays).

## 5. Verify

- [x] 5.1 `npm run gate` — 300 files, 8438 tests.
- [x] 5.2 **Ran the app**, all four seen rendered rather than inferred:
      - home at 1280 and at 390 — Preferences and Help direct, no dropdown, and
        the compact title is a title again rather than a menu trigger;
      - Palisade's phone bar and rail — "Next hint" now reads at the weight of
        the commands beside it, with no fill;
      - the hint fired, and its explanation panel **kept** its amber, which is
        the distinction the change rests on: the chrome offers plainly, the hint
        speaks in color;
      - Preferences → Appearance shows "Color scheme" (no "(experimental)") at
        the top, and Advanced holds only the offline settings.
- [x] 5.3 No test asserted the removed behavior. The sweep for `unfinished` in
      tests returns only game-solver status strings ("complete" | "unfinished" |
      "invalid") in sticks and subsets — a different vocabulary that happens to
      share a word — plus prose in two comments, both repointed.
- [x] 5.4 **About still opens from the home screen**, which mattered because the
      footer link is now its only route there. Worth recording *how* it was
      checked: calling `.click()` on the `command-link` host did nothing and
      looked like a defect; a real click on the rendered link opens the dialog.
      The synthetic call was the broken instrument, not the code.

## 6. Close out

- [x] 6.1 `app-shell` spec delta: amend the design direction on the two points
      this changes, and record the retired mechanism so it is not rebuilt.
- [x] 6.2 `openspec validate simplify-chrome-after-playtest --strict`.
