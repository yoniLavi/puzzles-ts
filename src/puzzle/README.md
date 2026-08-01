# Puzzle web components

This directory contains web components (and some related code) for rendering
and playing puzzles:

Components:
- puzzle-context: required wrapper component for any other puzzle components.
  - Provides the reactive `Puzzle` object for descendants (using @lit/context)
- puzzle-view: displays the puzzle and status bar, but doesn't handle user input
  - provides the on-screen canvas for the puzzle drawing API
- puzzle-view-interactive: a subclass of puzzle-view that adds mouse, touch, and keyboard handling
- puzzle-type-menu: implements a "Type" menu as described in section 2.3 of the puzzles documentation
- puzzle-keys: implements a virtual keyboard, undo/redo buttons, and other helpful UI controls
- puzzle-config: implements an extensible dialog for custom game types and preferences

Other code:
- Puzzle class (puzzle.ts): primary interface to the puzzle engine from the UI
  - Runs in the main thread
  - Proxies puzzle methods to the engine running in the worker (using comlink)
  - Exposes puzzle state as reactive properties (using lit-labs/signals)
  - Provides methods for calling useful midend functions
- worker.ts
  - Runs in a web worker
  - Constructs the native TypeScript engine (`src/native/engine/`) for the
    requested puzzle and exposes it over Comlink as a `PuzzleEngineSurface`
- Drawing class (drawing.ts): implements the puzzle drawing API, running in the worker

Historical note: until `retire-c-engine` this layer had two implementations
behind `PuzzleEngineSurface` — the TypeScript one above, and a `WorkerPuzzle`
that loaded an Emscripten-built wasm module per puzzle and drove a C++
`Frontend` through Embind. Every game is native TypeScript now, so the worker
constructs the TS engine unconditionally and there is no wasm in the app.
