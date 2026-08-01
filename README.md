# Puzzles Web App

### ▶ [Play the puzzles][play] in your browser

A progressive web app (PWA) of [Simon Tatham's Portable Puzzle
Collection][sgt-puzzles], plus additional puzzles from Lennard Sprong's
[puzzles-unreleased][puzzles-unreleased].

It started as a faithful browser adaptation of the upstream C collection
(compiled to WebAssembly), and is now being **rewritten to native
TypeScript, top-down**, so that the codebase can grow *beyond* upstream:
fast iteration on the UI and games, cheap addition of new games, and
cross-game features upstream doesn't have (quick-save, mistake-checking,
explained hints, per-game play aids). Targets Baseline 2023; works with
touch, mouse, and keyboard across screen sizes.

[play]: https://puzzles.twistymaze.com/
[puzzles-unreleased]: https://github.com/x-sheep/puzzles-unreleased
[sgt-puzzles]: https://www.chiark.greenend.org.uk/~sgtatham/puzzles/

## Status

**The app works, and the migration is done.** Every puzzle is playable, and
every one of the 57 is a native TypeScript implementation running on this
project's own engine. The C/WASM engine it grew up alongside — the sources, the
Embind adapter, the Emscripten build, the worker's wasm path — was retired on
2026-08-01 once the last game shipped. There is no C left to build and no wasm
in the app.

**The migration is deliberate divergence, not a faithful port.** We are
not tracking upstream and not preserving byte-identical behaviour or old
save-game / shared-ID compatibility from before the pivot. Going forward,
game IDs stay stable (the RNG is bit-identical) so shared seeds keep
reproducing boards.

The code is still rough in places (`package.json` says `0.0.1` — not a
mistake). The full strategic context lives in [`AGENTS.md`](AGENTS.md);
the authoritative migration rules are the `ts-migration` capability spec
at [`openspec/specs/ts-migration/spec.md`](openspec/specs/ts-migration/spec.md).

## Bug reports

If you have a **question** about a puzzle, please use the [*Discussion
forum*][discussions] rather than a bug report. For a bug, click
[*Issues*][issues] → *New Issue*. Helpful to include:

* App version (from the *About* box), browser, and device/OS.
* A screenshot if something looks wrong.
* For a game-specific bug, the game ID or seed (from *Share*), or an
  exported saved game (*Save…* → *Export…*).
* If you got the red "Uh-oh" crash dialog, an error report was already
  filed — add the Sentry "event ID" if you open an issue.

Simon Tatham's [*How to Report Bugs Effectively*][sgt-bugs] is worth a
read.

[discussions]: https://github.com/medmunds/puzzles-web/discussions
[issues]: https://github.com/medmunds/puzzles-web/issues
[sgt-bugs]: https://www.chiark.greenend.org.uk/~sgtatham/bugs.html

# Technical details

Everything below is for building or contributing.

## How the migration worked

- **`src/`** is the whole thing: the TypeScript web app, the engine
  (`src/native/engine/` — midend, `Game` interface, drawing and colour
  contracts) and all 57 games (`src/native/games/<id>/`).

- **It went top-down.** A TS midend and a clean `Game` interface first, then
  games in order of user-facing value (simplest first to establish the pattern,
  then the ones we wanted to enhance, then outward), with leaf libraries pulled
  in lazily as idiomatic TS when a game needed them. Each game ran on C until
  its port was accepted at parity, then flipped over and its C was deleted.

- **`puzzles/`** was a frozen git subtree of the upstream C collection, read as
  a *reference* while porting. It is gone. What outlived it moved to where it
  belongs: upstream's help sources to [help/upstream/](help/upstream), the MIT
  notices to [licences/](licences), and the two unbuilt experimental sources
  kept for future greenfield games to the openspec changes that read them. The
  C itself is in git history.

This replaced an earlier bottom-up, byte-identical-fidelity plan
(preserved on branch `legacy/seam-by-seam-fidelity` + tag
`pre-ts-pivot`). The why is in [`AGENTS.md`](AGENTS.md) "Approach".

## Structure

The web app is a Vite multipage app. Entry pages render at build time
(or in the dev server) via the custom
[vite-plugins/extra-pages.ts](vite-plugins/extra-pages.ts) plugin, from
templates under [templates/](templates/). `src/` is organised by role:

* `src/screens/` — top-level screen components (one per page).
* `src/dialogs/` — modal / popover overlays.
* `src/components/` — reusable leaf Lit components.
* `src/puzzle/` — the puzzle runtime + the Comlink worker boundary.
* `src/native/` — the puzzle engine and every game. `src/native/engine/`
  holds the `Game` interface, the `Midend`, the game registry, the
  drawing/colour contracts and the in-process test harness.
  `src/native/games/<id>/` holds each game — all 57 of them.
  `src/native/random/` is the bit-identical RNG port, kept so shared game
  IDs reproduce across builds.
* `src/store/` — Dexie (IndexedDB) schema for settings and saved games.
* Page entries, `main.ts`, the old-browser `preflight.ts` gate, the
  `sw.ts` service worker, and cross-cutting modules at `src/` root.
* `src/assets/manual/` is generated by `npm run build:assets` (gitignored)
  and is the only generated directory under `src/assets/`.
  `src/assets/icons/` is a committed thumbnail snapshot (see
  [openspec/specs/puzzle-icons/spec.md](openspec/specs/puzzle-icons/spec.md)).
* `src/puzzle/catalog-data.ts` is the committed game catalog.

The UI uses Lit web components and [Web Awesome][Web Awesome] design
tokens; reactive state via `@lit-labs/signals`; offline via a Workbox
service worker; telemetry via Sentry. The in-app help all lives under
[help/](help): this fork's own pages at the top level and in
[help/games/](help/games), and upstream's own words — the per-puzzle overview
fragments and the manual source — under
[help/upstream/](help/upstream), verbatim and with a README saying so.

[Web Awesome]: https://webawesome.com/docs/

## Building

Vite bundles the TypeScript PWA. That is the whole build — the games are
TypeScript, so there is no compilation step ahead of it. The one generated
asset is the in-app manual, and it is optional.

### Prerequisites

```shell
brew bundle install   # halibut, for the manual
npm install
```

The [Brewfile](Brewfile) used to carry Emscripten, cmake and jq for the WASM
puzzle engine. That engine was retired once every game had a native TypeScript
implementation (`retire-c-engine`, 2026-08-01), and they went with it. On Linux,
a distro `halibut` package works; without halibut you simply get no manual
pages.

### Commands

```shell
npm run dev          # Vite dev server (hot-reloads)
npm run build:assets # build the in-app manual into src/assets/manual/ (optional)
npm run build        # production build
npm run preview      # preview the production build
npm run check        # Biome format + lint
npm run test:run     # Vitest
```

`npm run dev` on a fresh clone works with nothing built first: the game catalog
is committed source (`src/puzzle/catalog-data.ts`), not a build output. Run
`build:assets` when you want the manual pages under `/help/manual/`.

## Contributing / work tracking

Work is tracked with **openspec** (`openspec/`): a change is proposed,
specced, implemented, then archived. Durable context is
[`AGENTS.md`](AGENTS.md) + [`openspec/project.md`](openspec/project.md);
the migration rules of record are the `ts-migration` capability spec.

## License

The web app code (including local modifications/additions to the puzzles
code) is MIT — see [LICENSE](./LICENSE). The upstream notices in
[licences/](licences) cover the ported games and the upstream help sources
(`help/upstream/`), also MIT. The built app bundles several open
source packages; required notices are in the app's *About* dialog (open
an issue if any seem missing).
