# Tasks — derive-dependency-attribution

## 1. The placeholder

- [x] 1.1 Measure first: of the 23 bundled packages, 21 carry a real copyright
      line and 2 ship the Apache appendix unfilled
      (`@material-design-icons/svg`, `signal-polyfill`).
- [x] 1.2 Use a *filled* appendix as the package's notice, as before.
- [x] 1.3 **Remove an unfilled one.** The first cut only declined to extract it
      and fell back to the license text — which still contains the placeholder,
      further down. The build caught that on the next run, which is why the
      check exists; `dependency-notices.test.ts` pins both halves.
- [x] 1.4 A package's own `NOTICE` still wins (Apache-2.0 §4(d); Dexie is the
      one dependency here that ships one).

## 2. Attribution

- [x] 2.1 Derived per package: `author`, else `contributors`, else the
      repository, with npm's `Name <email> (url)` form reduced to the name.
      Nothing is written down in this repo, so nothing has to be maintained
      when a dependency changes hands.
- [x] 2.2 Rendered beside the package name in the About dialog, quietly — it is
      context for the name, not a second heading.
- [x] 2.3 Phrased as *who publishes this*, never as a copyright notice. Where a
      package states a holder, that statement is in the notice text below and
      speaks for itself.
- [x] 2.4 All 23 packages now carry one; before this, none did.

## 3. Guard

- [x] 3.1 The build fails on an unfilled template, on a package credited by
      neither metadata nor a copyright line, and on an implausibly short list.
- [x] 3.2 The credit check reads a copyright **line**, not the word anywhere:
      every Apache and BSD license body says "the copyright owner" in its
      definitions, so a substring test would have passed for exactly the
      packages being checked.
- [x] 3.3 `vitest.config.ts` includes `vite-plugins/**`, so the build side can
      be tested at all. It could not be before, and both build-side modules had
      a bug their first run caught.
- [x] 3.4 Sixteen cases in `vite-plugins/dependency-notices.test.ts`.

## 4. The wider sweep the owner asked for

- [x] 4.1 Swept `help/`, `templates/`, `src/dialogs/`, `src/screens/`,
      `LICENSE.md`, `CREDITS.md` and `licenses/` for template placeholders
      (`[yyyy]`, `[year]`, `<COPYRIGHT HOLDER>`, `[fullname]`, "coming soon",
      lorem). **The Apache appendix was the only one.** The remaining hits are
      developer `TODO` comments in code and two legitimate `slot="placeholder"`
      attributes on empty saved-game lists.
- [x] 4.2 Our own notices check out: `LICENSE.md`'s four layered copyright
      lines all name a holder and a year range.

## 5. Close

- [x] 5.1 `openspec validate derive-dependency-attribution --strict`.
- [x] 5.2 Verified in the built app — the About box's license panel lists all 23
      with attribution and no placeholder (dev cannot show this: the JSON is
      generated at build).
- [x] 5.3 Full gate, commit, archive.
