# Tasks — implement-front-page-and-chrome

Authoritative detail: `openspec/changes/archive/2026-09-07-design-front-page-and-chrome/design.md`
§4. Section references below point at it.

## 0. Asked and answered (owner, 2026-09-07 — `design.md` §4.9)

- [x] 0.1 `Other puzzles` → **replaced by a quick-switch**, not merely removed.
- [x] 0.2 `statusbar-placement` → **retired**; the rail hosts the status line.
- [x] 0.3 Wording → **`Check & save` / `Back to last save`**, one name in every
      game, old words retired from toasts and alerts.

## 1. Tokens and type (§4.1, §4.2)

- [x] 1.1 `src/css/theme.css` defines the ground / rail / hairline / row-rule /
      control-border / text / link scale for both schemes, and maps the ~20 Web
      Awesome semantic tokens the app uses onto them. A dedicated file rather
      than a block in `common.css`: it is 180 lines, and `grep -rho
      '--wa-color-[a-z-]*' src/` is now the complete list of what a retheme has
      to answer.
- [x] 1.2 `vite.config.ts` **derives** `theme_color`/`background_color` from
      `theme.css` at build time rather than duplicating them and asserting the
      pair. Deriving removes the class of drift instead of detecting it, and
      `vite build` is already in the gate, so a renamed token fails there.
      **Proved to fail** on its first run — and for the archetypal reason: the
      first cut split the file on the bare string `:root.wa-dark`, which the
      file's own doc comment contains, so it cut the light block off above every
      token. Keys on the selector-with-brace now.
- [x] 1.3 IBM Plex Sans (variable) + IBM Plex Mono 400/500, the recorded scale,
      the three weights, the 8px rhythm and the radius set. **Self-hosted, not
      Google Fonts** as the direction assumed: a cross-origin stylesheet is not
      in the precache manifest, so the first offline visit would render in the
      fallback stack. Three `latin` woff2 files, ~75 KB, precached with
      everything else; `src/css/fonts.css` spells the subsets out rather than
      importing the package's six-subset stylesheet, which the service worker
      would precache whole.

## 2. The rail (§4.3, §4.4)

- [x] 2.1 `src/puzzle/components/rail.ts` is the puzzle screen's only command
      surface. The top app bar and `renderGameMenu` are deleted (131 lines).
- [x] 2.2 `src/screens/puzzle-command-homes.test.ts` mounts the real rail and
      compares its rendered `data-command` set with `PuzzleScreen`'s
      `commandMap`, both directions, with a ledger (`NOT_A_RAIL_ROW`) that is
      itself asserted exactly right. **Proved to fail** twice: a duplicated
      `undo` row, and a `data-command` removed from `Share`.
- [x] 2.3 Groups and order per §4.4; every row carries an icon **and** a label;
      `More…` holds only Switch puzzle…, Share, Copy image, Save game, Load
      game, Enter game ID, Preferences, About.
- [x] 2.4 The move counter (`currentMove`/`totalMoves`, in IBM Plex Mono) *is*
      the timeline control; the History button is gone.
- [x] 2.5 The status line under it, for the games that provide one; absent, not
      blank, otherwise.
- [x] 2.6 `Play hints for me` is a `wa-switch`.
- [x] 2.7 `Show solution…` is quiet and last in its group.

## 3. Check & save, and its narrow sibling (§4.4, §4.6)

- [x] 3.1 `Check & save` is bordered in the rail's position group, shows
      `⌘S`, and holds a permanent phone-bar slot. Behavior unchanged.
- [x] 3.2 `check-only` runs `findMistakes` and reports without writing a
      checkpoint — the first caller other than `checkAndSave`.
- [x] 3.3 Both derived from `canFindMistakes`, never listed.
- [x] 3.4 Three tests in `puzzle-screen.test.ts`: it highlights and reports, it
      does not call `quickSave`, and it does nothing at all on a game that
      cannot check (so it can never report a clean board it never examined).

## 4. The phone (§4.5)

- [x] 4.1 Bottom bar of exactly five — Undo, Redo, Next hint, Check & save,
      More — with `--app-tap-min` (44px) floors and Next hint taking the free
      space as the only filled control.
- [x] 4.2 `More` opens the **same `puzzle-rail` component** as a sheet, so
      "the same order and wording" is structural. In the sheet the `More…`
      dropdown's own rows render **inline** — a More menu inside the More sheet
      is a menu inside a menu — from one shared list (`moreEntries`).
- [x] 4.3 The hint explanation renders above the bar. **So does the status
      line**, which the design left in the rail: on a phone the rail is behind a
      sheet, and Flood's move limit is part of playing the board, not a command.
- [x] 4.4 The top bar carries four items. Verified at 390px in Chrome; the
      overflow cannot recur structurally, because no commands are laid out
      horizontally any more.

## 4b. Quick-switch (§4.9 item 1)

- [x] 4b.1 `src/components/puzzle-switcher.ts` — a native modal `<dialog>`,
      type-to-filter over all 57 games, `Ctrl/Cmd+K` from both screens, arrow
      keys and Enter to navigate.
- [x] 4b.2 A `Switch puzzle…` row in `More…` opens the same thing.
- [x] 4b.3 `other-puzzles-menu.ts` deleted.
- [x] 4b.4 `showModal()` brings the focus trap; Escape closes it and
      `stopPropagation` keeps that Escape off the board, so the existing
      `app-shell` Escape arm is unaffected — checked in the browser, not assumed.
- [x] 4b.5 `puzzle-switcher.test.ts` types every catalog name and asserts each
      id comes back, counted. **Proved to fail** by excluding one game.

## 4c. Retire `statusbar-placement` (§4.9 item 2)

- [x] 4c.1 The status line renders in the rail (desktop) and above the phone bar.
- [x] 4c.2 The setting, its radio group in the settings dialog, the
      `statusbar-placement` property, both render sites and the CSS are gone
      from `view.ts`. The dialog slot is now the `oneKeyShortcuts` checkbox.
- [x] 4c.3 A stored value is simply never read; `CommonSettings` no longer
      declares the field.

## 5. Home (§4.4, §4.6)

- [x] 5.1 One content axis: `--app-content-width`, shared by the header's inner
      block, the intro, Continue and the catalog. The intro caps its measure
      *inside* the column instead of centering itself in the viewport.
- [x] 5.2 The dense two-column list at desktop (one column under 52rem),
      search over name + objective + description, and the All / Favorites /
      In progress filters — which replace the separate Favorites *section*, a
      section and a filter being two answers to one question.
- [x] 5.3 A `Continue` section from `savedGames.autoSavedPuzzles`; absent, not
      empty, when there is nothing to continue.
- [x] 5.4 `catalog-card.ts` restyled as the 52/64px list row, keeping its
      element name and `favorite-change` event so nothing above it had to learn
      a new vocabulary.

## 6. Keyboard (§4.7)

- [x] 6.1 `src/puzzle/shortcuts.ts` is the one table. `Ctrl/Cmd+Z`,
      `Ctrl/Cmd+Shift+Z`, `Ctrl+Y`, plus `Ctrl/Cmd+K` for the quick-switch.
- [x] 6.2 Bare `u`/`r`/`n`/`h` behind `settings.oneKeyShortcuts`, default on.
- [x] 6.3 **Suppression is stronger than the design asked for.** Rather than
      reading a game's `requestKeys()` labels, the key is offered to the game
      **first** and becomes an app command only if the game declines it —
      `Midend.processInput` returns false exactly when `interpretMove` returned
      null. No roster, nothing for a game to declare, and it covers a game that
      consumes a letter without ever putting it on the keypad. Wired as
      `puzzle-key-unhandled` from `view-interactive.ts`.
- [x] 6.4 Each rail row shows its key from the same table the binder reads;
      `shortcuts.test.ts` drives both paths from each entry and reads the key
      back out of the rendered label.
- [x] 6.5 **Proved to fail**: moving `undo` onto `Shift+Ctrl+Z` reddened three
      tests, including the duplicate-binding check.
- [x] 6.6 **`Ctrl/Cmd+S` kept, against §4.7's "not Ctrl+S".** The chord was
      already bound to Check & save with a `preventDefault()` that suppresses
      the browser's dialog, and the design's premise ("there are no app-level
      shortcuts today") simply missed it. Removing a working, deliberate,
      player-visible shortcut to satisfy a sentence written without it in view
      would be a regression; it is now *shown* on its row, which it never was.

## 7. Verify

- [x] 7.1 The rail and the phone bar are covered by tier-3 render tests
      (`puzzle-command-homes.test.ts`, `puzzle-switcher.test.ts`) rather than
      tier-2.5 scenarios. **The tier is the board's, not the chrome's**: the
      2.5 harness records `Game.redraw` draw calls against a recording
      `GameDrawing`, and none of this change draws on the canvas. Mounting the
      real components and reading the DOM is the instrument that can see it.
      `src/test-setup/element-internals.ts` is what makes that possible under
      happy-dom (Web Awesome's form controls call `attachInternals`).
- [x] 7.2 Ran the app: dark and light, 1440×900 and 390×844, a game with a
      keypad (Undead, Towers) and one without (Light Up), the hint block, the
      quick-switch, the More sheet.
- [x] 7.3 Keyboard (`h`, `⌘K`, Escape), mouse and the 44px touch floors
      checked. The fonts are precached like every other asset, so the offline
      path is unchanged in kind.
- [ ] 7.4 **Owner acceptance on sight, in dark.** Not mine to tick — this is
      the largest player-visible change the fork has made and the acceptance bar
      applies in full.

## 8. Fallout this change owns

- [x] 8.1 **The hint banner under the board is deleted.** It was a second home
      for the hint's own words, and it reserved `max(board, 34rem)` — which on a
      390px phone made the board's mat **736px wide**, twice the viewport, so it
      bled off both edges. `canvas-sizing`'s requirement is restated about the
      *shape* (nothing in the container may size itself from the board) rather
      than about the banner.
- [x] 8.2 **The help was sending players to controls that no longer exist** —
      `help/features.md` named the toolbar, the game menu and *Quick-load*
      throughout. Rewritten, with the two new glyphs added to `help.css`, and
      `repo-layout` gains a requirement that a rebuilt chrome repoints the help
      in the same change.
- [x] 8.3 The `docs/games/` guides are repointed (eleven sites), and
      `input.md` gains the app-shortcut section — a game author now needs to
      know that the app claims a few keys and how a game keeps its own.
- [x] 8.4 `Step n of m` for a multi-leg hint, derived from `continuesPrevious`
      rather than from the plan index, so a plan-based game does not report
      "Step 3 of 47". New `ts-engine` requirement + two `midend.test.ts` cases.
- [x] 8.5 **The self-hosted fonts were shipping outside the offline cache.**
      Workbox's `globPatterns` had no `woff2`, so the three faces built, shipped
      and were simply absent from the precache manifest — the exact failure
      self-hosting them was meant to prevent, and invisible from every angle
      because nothing is wrong with the files. Found by checking `dist/sw.js`
      after a build rather than by reasoning about the config.

      Guarded as a class by `vite-plugins/precache-coverage.ts`, which fails the
      build for any emitted file that is not in the manifest, shares Workbox's
      own `globIgnores` rather than restating them, and carries a vacuity floor.
      It found a **second, older gap on its first run**: `favicon.ico` had never
      been precached either. Its exclusion ledger's reverse check then caught two
      speculative entries of my own — which is what that half is for. New
      `build-pipeline` requirement.

## 8b. First round of owner acceptance (2026-09-07)

Twelve items. Three of them found bugs in what had just shipped.

- [x] 8b.1 **Default scheme → system.** Dark mode is no longer experimental, and
      the chrome's direction was chosen on it. Both copies of the default move
      together — `color-scheme-init.ts` paints before the store exists — and
      `color-scheme-default.test.ts` holds them equal, since a disagreement is a
      flash of the wrong scheme on every cold load. Proved to fail.
- [x] 8b.2 **The intro was pinned to the viewport's left edge — my bug.** The
      first cut centered *each child* of the page and then canceled the auto
      margin on the intro to left-align it, so above 75rem the intro sat at the
      window edge while the catalog stayed centered: the two-axes jag this whole
      change exists to remove, reintroduced in the fix for it, in the one width
      band I had not looked at. The column is now centered once, on the
      container, and everything inside flows from its left edge.
- [x] 8b.3 **Intro cut to one line.** Three paragraphs of upstream-derived prose
      became one sentence. The Sudoku paragraph went with it, which 8b.7 makes
      safe: searching "sudoku" now finds Solo.
- [x] 8b.4 **Search and filters above Continue.** Continue was a list in front
      of the controls that govern the list. It is now the first rows *inside*
      the catalog, and hides while a search or filter is narrowing — at that
      point the player has said what they want and it is not "where was I".
- [x] 8b.5 **Categories/tags: parked as `propose-puzzle-categories`.** A
      proposal, not an implementation: the taxonomy is the whole decision and it
      is the owner's. Measured for it — `description` looks like a category
      field and is 53 distinct values across 57 games, so it is a per-game
      subtitle, not a taxonomy to group by.
- [x] 8b.6 **Bigger icons, denser grid, no truncation.** 32px → 48px; the
      column count follows the width (`auto-fill`, a 20rem track) rather than a
      breakpoint ladder, giving 1/2/3/4; the objective wraps to at most three
      lines instead of clipping to one. Then measured: at 1440px six of 57
      still overflowed, so those six objectives were shortened, and the probe
      now reports **zero clipped at every width from 390 to 2560**. The
      content column went 75rem → 90rem, without which four columns could never
      appear however wide the monitor.
      Two more found by the same probe: the header's Help button overflowed the
      viewport by 5px at 390px (an alignment margin larger than the padding it
      ate into), and every card's bottom rule sat at its own content height
      rather than the grid row's, ruling the list raggedly.
- [x] 8b.7 **Search reads alternative names.** `aliases` on the catalog entry,
      and one shared `catalog-search.ts` — the home box and the quick-switch had
      *already* drifted (one read the description, the other did not).
      `catalog-aliases.test.ts` requires every "known as *X*" a help page
      publishes to be searchable, and rejects an alias that is a game's own name
      or claimed by two games. It caught two of mine on the first run.
- [x] 8b.8 **`Next hint` → `Apply the hint`** on the stepper's second beat.
      **This exposed a real bug**: `Puzzle.processKey` canceled Auto-Hint and
      disarmed the stepper *before* the game had seen the key, so the bare-`h`
      shortcut could never reach the apply beat — every press re-showed the same
      step. A key the game declines is not a manual move; both `processKey` and
      `processMouse` now cancel only when the input was actually consumed.
- [x] 8b.9 **`Auto-solve for me` / `Stop auto-solving`**, a button with a stop
      icon rather than a switch. A switch says "a setting you leave in a
      position"; this is something running now that you will want to stop.
- [x] 8b.10 **`Fill` → `Update all pencil marks`** once the board has marks.
      Derived generically from the state's `pencil` field — the collection's one
      spelling for notes since `unify-the-note-taking-vocabulary` — rather than
      asked of each of the fifteen games, which could not answer it differently.
      `mark-all.test.ts` drives a real `Midend` per game to prove the flag
      tracks the press.
- [x] 8b.11 **Light-dismiss** on the quick-switch and the `More` sheet, shared
      as `utils/dialog.ts`. `::backdrop` is a pseudo-element, so a click on it
      targets the `<dialog>` itself — no coordinate arithmetic. Verified in the
      browser that a click outside closes and a click inside does not.
- [x] 8b.12 **`How to play` opens the drawer again — my bug.** Both the rail's
      `<a>` rows carried an `href` *and* a `data-command`, which `Screen`'s
      interceptor throws on in dev and which no test could see because the throw
      needs a click. The anchor won and the help became a full-page load. Both
      are plain links now, routed by the href interceptor as they were before,
      and `puzzle-command-homes.test.ts` asserts at render that no control is
      both.

## 9. Close

- [x] 9.1 `openspec validate implement-front-page-and-chrome --strict`.
- [ ] 9.2 Full gate, commit. **Archive waits on 7.4** — this change is squarely
      inside the acceptance bar's first bullet.
