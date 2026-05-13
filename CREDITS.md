# Credits

`puzzles-ts` is a TypeScript port-in-progress of Simon Tatham's Portable
Puzzle Collection, building on prior work that made these puzzles available
on the web. This file is a thank-you to the people whose work this project
stands on. The legal terms of reuse are in [`LICENSE.md`](./LICENSE.md);
this file is the graceful gesture.

## Upstream: Simon Tatham's Portable Puzzle Collection

Without Simon Tatham's puzzle collection there would be nothing to port.
The collection is roughly forty puzzles, decades of careful design and
implementation, MIT-licensed, and still actively maintained.

- Source: <https://git.tartarus.org/?p=simon/puzzles.git>
- Mirror / website: <https://www.chiark.greenend.org.uk/~sgtatham/puzzles/>
- Contributors: see [`puzzles/LICENCE`](./puzzles/LICENCE) for the canonical
  list (Simon Tatham plus a long roster of contributors).

The `puzzles/` directory in this repository is a subtree of upstream,
restricted to the files this fork actually builds (the engine plus the
GTK frontend, used headless for icon generation). Upstream platforms
this fork doesn't ship were removed in the
`prune-unsupported-frontends` openspec change; `puzzles/LICENCE` is
preserved verbatim to honour the MIT obligation.

## Direct parent: `puzzles-web` by Mike Edmunds

The PWA shell — Vite + Lit + Web Awesome, Comlink-wrapped WASM worker,
Embind/`webapp.cpp` frontend adapter, the drawing/JS bridging that
replaced upstream's Emscripten glue, and much else — is Mike Edmunds'
work in [`puzzles-web`](https://github.com/medmunds/puzzles-web). This
project forks from there and pushes the TS/WASM seam progressively
deeper into the C code.

- Source: <https://github.com/medmunds/puzzles-web>

## This project

The ongoing TypeScript port work in `puzzles-ts` is by Yoni Lavi. See
`git log` for the contribution history.
