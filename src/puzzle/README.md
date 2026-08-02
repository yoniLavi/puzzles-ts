# The puzzle layer

This directory holds two roles, in two places. The split is the point: before
`group-crowded-source-directories` they shared one folder, and every component
carried a redundant `puzzle-` filename prefix *because* it lived in a directory
called `puzzle`.

## `src/puzzle/` — the main-thread runtime

- **`puzzle.ts`** — the `Puzzle` class, the primary interface to the puzzle
  engine from the UI. Runs in the main thread; proxies puzzle methods to the
  engine running in the worker (using Comlink); exposes puzzle state as reactive
  properties (using `@lit-labs/signals`); provides methods for calling useful
  midend functions.
- **`worker.ts`** — runs in a web worker. Constructs the TypeScript engine
  (`src/engine/`) for the requested puzzle and exposes it over Comlink as a
  `PuzzleEngineSurface`.
- **`worker-adapter.ts`** — the Comlink-side adapter between that surface and
  the engine.
- **`drawing.ts`** — the `Drawing` class implementing the puzzle drawing API,
  running in the worker.
- **`catalog.ts` / `catalog-data.ts`** — the committed game catalog and the
  lookups over it.
- **`contexts.ts`** — the `@lit/context` token for the `Puzzle` object. It lives
  at the root rather than under `components/` because dialogs and panels outside
  this directory consume it too.
- **`augmentation.ts`, `canvas-sizing.ts`, `icon-capture.ts`,
  `quick-save-actions.ts`, `engine-surface.ts`** — supporting runtime pieces.

## `src/puzzle/components/` — the puzzle-specific Lit components

Filenames do not repeat the directory; **custom element names are unchanged**,
because they are the app's DOM vocabulary (`templates/*.html.hbs`, every
component's templates, the Playwright checks).

| file | element | role |
| --- | --- | --- |
| `context.ts` | `<puzzle-context>` | required wrapper for any other puzzle component — provides the reactive `Puzzle` object to descendants |
| `view.ts` | `<puzzle-view>` | displays the puzzle and status bar; provides the on-screen canvas for the drawing API. Handles no input |
| `view-interactive.ts` | `<puzzle-view-interactive>` | subclass of `<puzzle-view>` adding mouse, touch and keyboard handling |
| `type-menu.ts` | `<puzzle-type-menu>` | the "Type" menu described in section 2.3 of the puzzles documentation |
| `keys.ts` | `<puzzle-keys>` | virtual keyboard, undo/redo buttons and other controls |
| `history.ts` | `<puzzle-history>` | the history/timeline bar, including Check &amp; Save |
| `config.ts` | `<puzzle-custom-params-*>`, `<puzzle-preferences-*>` | extensible dialogs for custom game types and preferences |
| `end-notification.ts` | `<puzzle-end-notification>` | the completion notification |
| `other-puzzles-menu.ts` | `<other-puzzles-menu>` | the cross-puzzle navigation menu |

Historical note: until `retire-c-engine` this layer had two implementations
behind `PuzzleEngineSurface` — the TypeScript one above, and a `WorkerPuzzle`
that loaded an Emscripten-built wasm module per puzzle and drove a C++
`Frontend` through Embind. Every game is native TypeScript now, so the worker
constructs the TS engine unconditionally and there is no wasm in the app.
