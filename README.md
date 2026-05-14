# Puzzles Web App

### ▶ [Play the puzzles][play] in your browser

This is a progressive web application (PWA) port of [Simon Tatham’s Portable
Puzzle Collection][sgt-puzzles], with additional puzzles from Lennard Sprong's
[puzzles-unreleased][puzzles-unreleased].

The code targets Baseline 2023, so should run in any reasonably recent browser.
It's meant to work with a variety of input devices (including touch screens)
and display sizes.

The app is, for the most part, a faithful adaptation of the original puzzle
collection, modulo UI changes for touch input and smaller screens. It does also
include a few [features and UI changes][differences] that I either wanted for
my own play, or wanted to experiment with before submitting patches upstream.

[differences]: https://puzzles.twistymaze.com/help/differences
[play]: https://puzzles.twistymaze.com/
[puzzles-unreleased]: https://github.com/x-sheep/puzzles-unreleased
[sgt-puzzles]: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/

## Status

The *app* is working. There are definitely some bugs and planned improvements,
but you should be able to play all the puzzles without major problems.

The *code* is a bit rough and ready. I'm planning to substantially rework large
parts of it. There are still TODO comments scattered throughout. There are no
tests yet. I wouldn't really recommend using it as a starting point for your
own code right now, other than maybe seeing how I worked around certain browser
bugs. (The package.json version is 0.0.1. That's not a mistake.)

## Bug reports

If you have a **question** about a puzzle or the collection, please use the
[*Discussion forum*][discussions] rather than creating a bug report.

If you came here because you've encountered a bug, thanks for helping.
Click [*Issues*][issues] above, then the green *New Issue* button.

A few requests:

* Please include the app version (from the *About* box), and say what web
  browser you're using (Chrome, Firefox, etc.) and what device or OS.

* A screenshot is often helpful, especially if something looks wrong.

* If the bug is specific to a particular game, please include the game ID
  or random seed (from _Share_ in the game menu). Or better yet export a saved
  game file and upload that with the bug report (_Save…_ in the game menu, then
  click _Export…_).

* If you got the red "Uh-oh" crash dialog, an error report has already been
  filed. If you have some information to add (or an idea on how to fix the
  problem) you can open an issue here; otherwise there's no need for a separate
  bug report. (If you *do* open an issue here, please include the Sentry "event
  ID" from the crash dialog.)

Simon Tatham has some really useful tips for [*How to Report Bugs
Effectively*][sgt-bugs], available in several languages.

[discussions]: https://github.com/medmunds/puzzles-web/discussions
[issues]:https://github.com/medmunds/puzzles-web/issues
[sgt-bugs]: https://www.chiark.greenend.org.uk/~sgtatham/bugs.html

# Technical details

Everything below this point is technical info for people who want to build
their own version of this app or help contribute code.

## Structure

There are two main parts to the code:

* The [`/puzzles`](puzzles) directory is a git subtree of the upstream
  [portable puzzle collection repo][upstream], with some local changes.
  Code is written in C and C++ and compiled to WASM using [Emscripten]
  (installed via Homebrew — see [Brewfile](Brewfile)).

* The [`/src`](src) directory is the web app. Code is written in TypeScript
  using [Lit] and [Web Awesome] components. It's built using [vite], with a few
  custom plugins.

There are a few other directories whose names should mostly be self explanatory.

[Emscripten]: https://emscripten.org/
[emsdk]: https://github.com/emscripten-core/emsdk
[Lit]: https://lit.dev/
[vite]: https://vite.dev/
[upstream]: https://git.tartarus.org/?p=simon/puzzles.git
[Web Awesome]: https://webawesome.com/docs/

### Puzzles code

The puzzles directory is a subtree of the upstream repo, restricted to the
files this fork actually builds (the engine compiled to wasm via Emscripten).
Upstream platforms that this fork doesn't ship — Windows, macOS, KaiOS,
NestedVM, Java applet, the KaiOS-targeted Emscripten adapter, and the upstream
Linux .desktop / packaging files — were removed in the
`prune-unsupported-frontends` openspec change. The GTK frontend (used as a
headless icon screenshotter) was removed in `drop-icon-generation`. Refer to
upstream for those.

Local changes and additions:

* [webapp.cpp](puzzles/webapp.cpp) is a puzzles [frontend] for the PWA. Or
  really, a frontend *adapter* that allows most of the actual frontend to be
  implemented in TypeScript. (This is what replaces upstream's Emscripten
  glue for the web build.)

  C++ is necessary to leverage emcc's [Embind][embind]. My original goal was to
  automate TypeScript type declarations to ensure the TS app code matched the
  C-side frontend adapter. (This works, but requires a lot of boilerplate in the
  C++, and isn't exactly automatic.) Embind also helps coordinate pointer
  ownership and memory management between WASM and JS, which has been helpful.

* [emcc-dependency-info.py](puzzles/emcc-dependency-info.py) is an attempt
  to automate license notice extraction.

* Most of the individual puzzle backends have been modified to support a
  NARROW_BORDERS compile option, which eliminates most padding space within
  the puzzle's drawing area so that we can manage it in CSS (for tight screens).

* I've made a few additions to midend.c to support some UI features.

[embind]: https://emscripten.org/docs/porting/connecting_cpp_and_javascript/embind.html
[frontend]: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/devel/intro.html#intro-frontend

### Web app code

The web app is a vite multipage app (MPA). Most of the entry pages are rendered
at build time (or on-the-fly in vite's dev server) via this project's custom
[vite-plugins/extra-pages.ts](vite-plugins/extra-pages.ts) plugin. There are
two main templates under [templates/](templates/):

* [templates/index.html.hbs](templates/index.html.hbs) is the template for the
  main screen with the list of puzzles. It's meant to render *something* useful
  with JavaScript disabled, but most of the interesting functionality is in
  src/screens/home-screen.ts.

* [templates/puzzle.html.hbs](templates/puzzle.html.hbs) is the template used
  for generating all individual puzzle pages (e.g., `/blackbox`, `/bridges`,
  etc.). The puzzle pages don't work without JavaScript, and nearly all of the
  interesting functionality is in src/screens/puzzle-screen.ts.

The src directory is organised by role:

* `src/screens/` — top-level screen components (one per HTML page) and the
  base `Screen` class.
* `src/dialogs/` — modal / popover overlays.
* `src/components/` — reusable leaf Lit components.
* HTML page entry points (`home-page.ts`, `puzzle-page.ts`), main bootstrap
  (`main.ts`), the old-browser preflight gate (`preflight.ts`), the service
  worker (`sw.ts`), and cross-cutting modules (`routing.ts`, `color-scheme.ts`,
  `icons.ts`) live at `src/` root.
* `src/assets/puzzles` is generated by `npm run build:wasm`
  ([see below](#building-puzzles)) and is not included in the repo.
  `src/assets/icons` is the exception: per-puzzle thumbnails are a
  committed snapshot maintained per
  [openspec/specs/puzzle-icons/spec.md](openspec/specs/puzzle-icons/spec.md).

* The app uses custom web elements built with Lit. The rough idea is that
  components in [src/puzzle](src/puzzle) would eventually be reusable in other
  contexts (e.g., to display a static puzzle in a help system, or embed a
  particular puzzle in some other app or site). PWA-specific components live
  under `src/screens/`, `src/dialogs/`, and `src/components/`.

* The compiled wasm is run in a web worker, exposed in the main thread via
  [Comlink]. (See [src/puzzle/README.md](src/puzzle/README.md) for more info.)

* Offline capability is provided by a service worker ([src/sw.ts](src/sw.ts))
  built using [Workbox] and [vite-plugin-pwa].

* Settings and saved games are stored in IndexedDB managed by [Dexie.js].
  (See [src/store](src/store).)

* I'm currently using [@lit-labs/signals] for reactive data that doesn't belong
  to some specific custom element (mainly the puzzle state and user settings).
  It seems to be working fine, but I may change to lit-mobx at some point
  for something less experimental.

* I'm using [Web Awesome] web components, and have just borrowed their
  [design tokens] to use throughout this app's CSS.

* The help system is assembled from three different areas (also using the
  extra-pages plugin):
  [help](help) for the main help pages; [puzzles/html](puzzles/html) (from the
  upstream repo) for the initial overview help for each puzzle; and the manual
  (sourced from [puzzles/puzzles.but](puzzles/puzzles.but) and built into html
  in src/assets/puzzles/manual).

[Comlink]: https://github.com/GoogleChromeLabs/comlink
[design tokens]: https://webawesome.com/docs/tokens/
[Dexie.js]: https://dexie.org/
[@lit-labs/signals]: https://lit.dev/docs/data/signals/
[vite-plugin-pwa]: https://vite-pwa-org.netlify.app/
[Workbox]: https://developer.chrome.com/docs/workbox/

## Building

The build has two halves: a host-native shell script produces the puzzles'
wasm assets; vite bundles the TypeScript PWA around them.

See the [build-deploy.yml](.github/workflows/build-deploy.yml) GitHub Workflow
for the exact options used to produce the production build that appears on the
website.

### Prerequisites

All native build dependencies (Emscripten, halibut, jq, cmake, coreutils)
are listed in the repo-root [Brewfile](Brewfile). On macOS or Linuxbrew:

```shell
brew bundle install
```

If you maintain your own emsdk install (or need a specific Emscripten version
not yet in Homebrew), activate it before running `npm run build:wasm` — the
script just shells out to whatever `emcmake`/`emcc` are first on `PATH`.

### Building puzzles

All commands are run from the repo root.

Build the puzzles wasm, manual, catalog.json and dependencies.json (writes
into `src/assets/puzzles/`, gitignored — regenerate any time):
```shell
npm run build:wasm
```

(`npm run build:assets` is an alias.)

The puzzle thumbnail PNGs under `src/assets/icons/` are a committed snapshot.
Adding a new puzzle to the catalog requires producing two PNGs (64×64 and
128×128) by hand — see
[openspec/specs/puzzle-icons/spec.md](openspec/specs/puzzle-icons/spec.md)
for the manual screenshot workflow.

`scripts/build-emcc.sh` honours a few environment variables — see the comments
at the top of the script.

To build with the TypeScript random module bridged in (see
`openspec/specs/random/`), set `USE_TS_RANDOM=1` for `build:wasm` *and* set
`VITE_USE_TS_RANDOM=1` when running vite — both halves have to agree:

```shell
USE_TS_RANDOM=1 npm run build:wasm
VITE_USE_TS_RANDOM=1 npm run dev
```

#### Linux notes

On Linux the Brewfile still works under Linuxbrew, but distro packages
typically suffice — install your distro's equivalents of `emscripten`,
`halibut`, `jq`, `cmake`. The script assumes `emcmake`/`emcc` are on `PATH`.

### Building the web app

Install the tooling and dependencies:
```shell
npm install
```

Run the dev server:
```
npm run dev
```

Build for production:
```
npm run build
```

Preview the production build:
```
npm run preview
```

## License

This web app code (including local modifications and additions to the original
puzzles code) is made available under the MIT License. See [LICENSE](./LICENSE).

The [puzzles/LICENCE](puzzles/LICENCE) file covers the upstream puzzles code
pulled into that subtree. And the license text in the upstream manual covers
that manual (puzzles/puzzles.but). Both use the MIT License.

The built app incorporates portions of several open source packages. Required
notices can be found in the app's _About_ dialog. (Please open an issue if any
seem missing.)
