# Credits

`puzzles-ts` is a TypeScript port of Simon Tatham's Portable Puzzle
Collection, building on prior work that made these puzzles available
on the web. This file is a thank-you to the people whose work this project
stands on. The legal terms of reuse are in [`LICENSE.md`](./LICENSE.md);
this file is the graceful gesture.

## Upstream: Simon Tatham's Portable Puzzle Collection

Without Simon Tatham's puzzle collection there would be nothing to port.
The collection is roughly forty puzzles, decades of careful design and
implementation, MIT-licensed, and still actively maintained.

- Source: <https://git.tartarus.org/?p=simon/puzzles.git>
- Mirror / website: <https://www.chiark.greenend.org.uk/~sgtatham/puzzles/>
- Contributors: see
  [`licences/sgt-puzzles-LICENCE`](./licences/sgt-puzzles-LICENCE) for the
  canonical list (Simon Tatham plus a long roster of contributors).

This repository used to carry a `puzzles/` subtree of upstream's C sources,
read as a reference while porting. The C is gone (`retire-c-engine`). Of the
help material it was left holding, the per-puzzle overview text was adopted
into this project's own pages under [`help/games/`](./help/games), keeping
Simon's words (`retire-the-upstream-help-tree`); the long-form desktop manual
was deleted rather than served, because it documents his desktop builds and not
this app. The MIT notice is preserved verbatim in [`licences/`](./licences) to
honour the obligation.

## Third-party puzzles: `puzzles-unreleased` by Lennard Sprong (x-sheep)

Thirteen of the games here — ABCD, Ascent, Boats, Bricks, Clusters, Crossing,
Mathrax, Rome, Salad, Seismic, Spokes, Sticks and Subsets — are ports of
Lennard Sprong's `puzzles-unreleased`, a collection of contributions to
Simon Tatham's puzzles written over more than a decade and MIT-licensed.
Their in-app help pages under [`help/games/`](./help/games) are adapted from
the documentation shipped with that project.

- Source: <https://github.com/x-sheep/puzzles-unreleased>
- Copyright © 2011–2025 Lennard Sprong. Licence:
  [`licences/puzzles-unreleased-LICENCE`](./licences/puzzles-unreleased-LICENCE).

## Direct parent: `puzzles-web` by Mike Edmunds

The PWA shell — Vite + Lit + Web Awesome, Comlink-wrapped WASM worker,
Embind/`webapp.cpp` frontend adapter, the drawing/JS bridging that
replaced upstream's Emscripten glue, and much else — is Mike Edmunds'
work in [`puzzles-web`](https://github.com/medmunds/puzzles-web). This
project forked from there and pushed the TS/WASM seam progressively deeper
into the C code until no C was left; the shell it inherited is still the
shell it ships.

- Source: <https://github.com/medmunds/puzzles-web>

## This project

The ongoing TypeScript port work in `puzzles-ts` is by Yoni Lavi. See
`git log` for the contribution history.
