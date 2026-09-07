# derive-dependency-attribution

## Why

The About dialog's third-party section told players this, verbatim:

> Copyright [yyyy] [name of copyright owner]

That is the Apache-2.0 appendix's **template** — the boilerplate the license
tells authors to fill in — reproduced unfilled. It attributes nobody, and to a
reader it looks like this project left a blank in its own copyright notice.
Owner-reported during acceptance of `implement-front-page-and-chrome`
(2026-09-07): *"please review whatever packages we are actually relying on, and
properly add them, so it's all tidy"*, and *"if there's a way to derive these
automatically, that would be awesome"*.

**It was our own extraction that produced it.** `vite.config.ts` pulled the
appendix's `Copyright …` line out of the license text and used it as the
package's notice — correct for Comlink, which fills it in with "Copyright 2017
Google Inc.", and exactly wrong for the two packages that do not. The code even
said so: *"(Some don't even bother filling in the template, but that's a
different issue)."* It was the same issue.

Measured across the 23 packages the app bundles: **21 already carry a real
copyright line**, and **2 ship the appendix blank** — `@material-design-icons/svg`
and `signal-polyfill`.

The wider gap is that the About box showed *no attribution at all* — just a
package name and its license text. For a reader wanting to know whose work this
app is standing on, a name like `@floating-ui/utils` answers nothing.

## What Changes

- **`vite-plugins/dependency-notices.ts`** replaces the inline template in
  `vite.config.ts`. It is pure functions over what `rollup-plugin-license`
  provides, so the awkward cases are testable directly rather than by
  inspecting a built artifact.
- **An unfilled appendix is removed, not reproduced.** The appendix is headed
  "How to apply the Apache License to your work" and is addressed to authors,
  not recipients; dropping it costs a reader nothing. A *filled* one is still
  used as the package's notice, and a package's own `NOTICE` file still wins
  over both (Apache-2.0 §4(d)).
- **Attribution is derived per package** from its `author`, else its
  `contributors`, else its repository, and rendered beside the name. All 23 now
  carry one. It is phrased as *who publishes this*, never as a copyright notice
  — this project is in no position to assert who holds copyright in someone
  else's code.
- **The build fails** on an unfilled template or an uncredited package, with a
  vacuity floor on the count. `vite build` is in the commit gate.
- **`vitest.config.ts` now includes `vite-plugins/**`.** The build side is real
  logic — this and `precache-coverage` — and had no tests because there was
  nowhere to put them.

## Impact

- Affected specs: `licensing` gains a requirement that the About box credits
  every bundled package and never shows a template.
- Affected code: `vite.config.ts`, `vite-plugins/dependency-notices.ts` (new),
  `src/dialogs/about-dialog.ts`, `vitest.config.ts`.
- Risk: attribution text is player-visible and legally adjacent. Nothing here
  invents a copyright holder; the one new claim is "this package is published
  by X", taken from the package's own metadata.

## Out of scope

**Whether the About box should also ship a full copy of each license.**
Apache-2.0 §4(a) asks recipients be given a copy of the License; today the app
reproduces the notice and the license's own "You may obtain a copy at
<url>" line. That is common practice and predates this change, but it is a
separate question from the placeholder, and answering it here would mix a
compliance decision into a tidy-up. Noted rather than fixed.
