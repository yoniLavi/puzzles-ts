# Tasks — implement-front-page-and-chrome

Authoritative detail: `openspec/changes/design-front-page-and-chrome/design.md`
§4 (archived with that change). Section references below point at it.

## 0. Ask first

- [ ] 0.1 Put §4.9's three items to the owner **before** touching them: removing
      the `Other puzzles` menu, retiring `statusbar-placement`, and renaming
      Quick-save / Quick-load. Record each answer here.

## 1. Tokens and type (§4.1, §4.2)

- [ ] 1.1 Define the ground / rail / hairline / row-rule / control-border /
      text / link scale for both schemes in `src/css/common.css`, replacing the
      Web Awesome stock brand blue.
- [ ] 1.2 Move `vite.config.ts`'s `theme_color` and `background_color` with
      them. Assert the pair against the tokens in a test so they cannot drift
      again — they are a resolved value typed out as hex.
- [ ] 1.3 IBM Plex Sans + IBM Plex Mono, with fallbacks; the recorded scale and
      the three weights; 8px rhythm; the radius set. Check the fonts against
      the offline/PWA constraint before adding them.

## 2. The rail (§4.3, §4.4)

- [ ] 2.1 Build the rail as the puzzle screen's only command surface; delete the
      top app bar and `renderGameMenu`.
- [ ] 2.2 Every command from the old menu **and** the old toolbar has exactly
      one home. Guard it: a test asserting each `commandMap` key is reachable
      from exactly one place in the rendered rail.
- [ ] 2.3 Groups and order per §4.4; every row icon **and** label; `More…`
      holds only Share, Copy image, Save game, Load game, Enter game ID,
      Preferences, About.
- [ ] 2.4 The move counter (`currentMove`/`totalMoves`) replaces the History
      button and opens the timeline.
- [ ] 2.5 The status line under it, for the nine games that provide one; absent
      otherwise, not blank.
- [ ] 2.6 `Play hints for me` as a switch, not a button.
- [ ] 2.7 `Show solution…` quiet, last in its group, and confirmed.

## 3. Check & save, and its narrow sibling (§4.4, §4.6)

- [ ] 3.1 `Check & save` keeps quick access: bordered in the rail's position
      group with a shortcut, and a permanent slot in the phone bar. Behavior
      unchanged — it verifies first and refuses to save over a mistake.
- [ ] 3.2 `Check without saving`: a quiet command low in "Help me play" that
      runs `findMistakes` and reports without writing a checkpoint — the first
      caller other than `checkAndSave`.
- [ ] 3.3 Both present only where `canFindMistakes`; derived, not listed.
- [ ] 3.4 Test that the quiet one highlights and reports and leaves the
      quick-save slot untouched — including that a checkpoint saved earlier is
      still restorable afterwards, which is the case it exists for.

## 4. The phone (§4.5)

- [ ] 4.1 Bottom bar of exactly five — Undo, Redo, Next hint, Check & save,
      More — ≥44px targets, Next hint taking the free space and the only
      filled one.
- [ ] 4.2 `More` opens the rail as a sheet, same order and wording.
- [ ] 4.3 The hint explanation renders above the bar.
- [ ] 4.4 The top bar carries four items and is proved not to overflow at 390px
      — the defect this replaces.

## 5. Home (§4.4, §4.6)

- [ ] 5.1 One content axis: the intro and the catalog share a max-width and a
      left edge.
- [ ] 5.2 The dense two-column list at desktop, single column on phone; search;
      the All / Favorites / In progress filters.
- [ ] 5.3 The Resume row from `savedGames.autoSavedPuzzles`.
- [ ] 5.4 Retire or restyle `catalog-card.ts` as the list row.

## 6. Keyboard (§4.7)

- [ ] 6.1 Always-on `Ctrl/Cmd+Z` undo, `Ctrl/Cmd+Shift+Z` and `Ctrl+Y` redo. Not
      `Ctrl+S`.
- [ ] 6.2 Bare `u` / `r` / `n` / `h` behind a preference, default on.
- [ ] 6.3 Suppress a bare letter for a game that consumes it, **derived** from
      what the game already declares (`requestKeys()` labels, the button codes
      `emittable-keys` scans) — never a roster. Carry a vacuity count.
- [ ] 6.4 Show each shortcut on its rail row, and assert the shown key is the
      key that is bound, so the label cannot become decorative.
- [ ] 6.5 Prove the suppression fails: bind `u` in a game that takes letters,
      watch the guard go red, restore.

## 7. Verify

- [ ] 7.1 Tier 2.5 render scenarios for the rail and the phone bar.
- [ ] 7.2 Run the app: dark and light, phone and desktop widths, a game with a
      reference and one without, a game with pencil marks and one without.
- [ ] 7.3 Check keyboard, mouse and touch (`AGENTS.md` DO list), and the PWA
      offline path with the new fonts.
- [ ] 7.4 Owner acceptance on sight, in dark, per the acceptance bar. No
      shortfall is called cosmetic.

## 8. Close

- [ ] 8.1 `openspec validate implement-front-page-and-chrome --strict`.
- [ ] 8.2 Full gate, commit, archive.
